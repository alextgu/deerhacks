import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "@/lib/solana/solana_program.json";
import {
  getProgramId,
  getUserIdentityPDA,
  getConfigPDA,
} from "@/lib/solana/program";

export const maxDuration = 30;

function getAuthorityKeypair(): Keypair {
  const raw = process.env.SOLANA_AUTHORITY_KEYPAIR;
  if (!raw) {
    throw new Error("SOLANA_AUTHORITY_KEYPAIR is not set");
  }
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userWallet } = body as { userWallet?: string };
    if (!userWallet || typeof userWallet !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid userWallet" },
        { status: 400 }
      );
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "confirmed"
    );
    const authority = getAuthorityKeypair();
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: authority.publicKey,
        signTransaction: async (tx) => {
          if (tx instanceof Transaction) {
            tx.partialSign(authority);
          } else {
            (tx as VersionedTransaction).sign([authority]);
          }
          return tx;
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            if (tx instanceof Transaction) {
              tx.partialSign(authority);
            } else {
              (tx as VersionedTransaction).sign([authority]);
            }
            return tx;
          });
        },
      },
      { commitment: "confirmed" }
    );

    const programId = getProgramId();
    const program = new Program(idl as any, provider);

    const userIdentityPDA = getUserIdentityPDA(new PublicKey(userWallet));
    const configPDA = getConfigPDA();

    const sig = await program.methods
      .penalizeAbandonment()
      .accounts({
        authority: authority.publicKey,
        config: configPDA,
        userIdentity: userIdentityPDA,
      })
      .rpc();

    return NextResponse.json({ signature: sig });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
