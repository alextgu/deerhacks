import { Program, AnchorProvider, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  type Signer,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import idl from "./solana_program.json";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID ?? "CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW"
);

export type SkillWeight = { name: string; weight: number };

export type ReputationIDL = typeof idl;
const REPUTATION_IDL = idl as Idl;

export function getProgramId(): PublicKey {
  return PROGRAM_ID;
}

export function getUserIdentityPDA(walletPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-identity"), walletPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getConfigPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
  return pda;
}

function getProvider(connection: Connection, wallet: WalletContextState): AnchorProvider {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  return new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction!,
      signAllTransactions: wallet.signAllTransactions!,
    },
    { commitment: "confirmed" }
  );
}

export function getReputationProgram(connection: Connection, wallet: WalletContextState) {
  const provider = getProvider(connection, wallet);
  return new Program(idl as ReputationIDL, provider);
}

export async function buildInitializeUserTx(
  connection: Connection,
  walletPubkey: PublicKey,
  archetype: string,
  skillWeights: SkillWeight[]
): Promise<Transaction> {
  const program = getReadOnlyProgram(connection);
  const userIdentity = getUserIdentityPDA(walletPubkey);
  return await (program.methods as any)
    .initializeUser(archetype, skillWeights)
    .accounts({
      userIdentity,
      signer: walletPubkey,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .transaction();
}

export async function initializeUser(
  connection: Connection,
  wallet: WalletContextState,
  archetype: string,
  skillWeights: SkillWeight[]
): Promise<string> {
  const program = getReputationProgram(connection, wallet);
  const userIdentity = getUserIdentityPDA(wallet.publicKey!);
  const sig = await (program.methods as any)
    .initializeUser(archetype, skillWeights)
    .accounts({
      userIdentity,
      signer: wallet.publicKey!,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .rpc();
  return sig;
}

export async function awardKarma(
  connection: Connection,
  wallet: WalletContextState,
  recipientWalletPubkey: PublicKey,
  rating: number
): Promise<string> {
  const program = getReputationProgram(connection, wallet);
  const raterIdentity = getUserIdentityPDA(wallet.publicKey!);
  const recipientIdentity = getUserIdentityPDA(recipientWalletPubkey);
  const sig = await (program.methods as any)
    .awardKarma(rating)
    .accounts({
      raterIdentity,
      rater: wallet.publicKey!,
      recipientIdentity,
    })
    .rpc();
  return sig;
}

export async function endorseSkill(
  connection: Connection,
  wallet: WalletContextState,
  recipientWalletPubkey: PublicKey,
  skillName: string
): Promise<string> {
  const program = getReputationProgram(connection, wallet);
  const recipientIdentity = getUserIdentityPDA(recipientWalletPubkey);
  const sig = await (program.methods as any)
    .endorseSkill(skillName)
    .accounts({
      endorser: wallet.publicKey!,
      recipientIdentity,
    })
    .rpc();
  return sig;
}

function getReadOnlyProgram(connection: Connection): Program {
  const dummyWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs,
  };
  const provider = new AnchorProvider(
    connection,
    dummyWallet as any,
    { commitment: "confirmed" }
  );
  return new Program(REPUTATION_IDL, provider);
}

export async function fetchUserIdentity(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<{
  authority: PublicKey;
  archetype: string;
  skillWeights: SkillWeight[];
  karma: number;
  endorsements: { endorser: PublicKey; skill: string }[];
  abandonmentCount: number;
  isFlagged: boolean;
} | null> {
  const program = getReadOnlyProgram(connection);
  const userIdentityPDA = getUserIdentityPDA(walletPubkey);
  try {
    const account = await (program.account as any).userIdentity.fetch(
      userIdentityPDA
    );
    return {
      authority: account.authority,
      archetype: account.archetype,
      skillWeights: account.skillWeights.map((s: { name: string; weight: number }) => ({
        name: s.name,
        weight: s.weight,
      })),
      karma: Number(account.karma),
      endorsements: account.endorsements.map(
        (e: { endorser: PublicKey; skill: string }) => ({
          endorser: e.endorser,
          skill: e.skill,
        })
      ),
      abandonmentCount: account.abandonmentCount,
      isFlagged: account.isFlagged,
    };
  } catch {
    return null;
  }
}
