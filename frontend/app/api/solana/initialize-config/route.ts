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
import { getConfigPDA } from "@/lib/solana/program";

export const maxDuration = 30;

/**
 * One-time setup: initializes the program config with the backend authority.
 * Call with the deployer wallet (or any admin) and the authority pubkey that
 * will be allowed to call penalize_abandonment.
 *
 * Body: { authorityPubkey: string }
 * Header: x-initialize-config-secret: <SOLANA_INITIALIZE_CONFIG_SECRET>
 */
function getDeployerKeypair(): Keypair {
  const raw = process.env.SOLANA_DEPLOYER_KEYPAIR ?? process.env.SOLANA_AUTHORITY_KEYPAIR;
  if (!raw) {
    throw new Error("SOLANA_DEPLOYER_KEYPAIR or SOLANA_AUTHORITY_KEYPAIR is not set");
  }
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-initialize-config-secret");
    const expected = process.env.SOLANA_INITIALIZE_CONFIG_SECRET;
    if (expected && secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { authorityPubkey } = body as { authorityPubkey?: string };
    if (!authorityPubkey || typeof authorityPubkey !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid authorityPubkey" },
        { status: 400 }
      );
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "confirmed"
    );
    const deployer = getDeployerKeypair();
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: deployer.publicKey,
        signTransaction: async (tx) => {
          if (tx instanceof Transaction) {
            tx.partialSign(deployer);
          } else {
            (tx as VersionedTransaction).sign([deployer]);
          }
          return tx;
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            if (tx instanceof Transaction) {
              tx.partialSign(deployer);
            } else {
              (tx as VersionedTransaction).sign([deployer]);
            }
            return tx;
          });
        },
      },
      { commitment: "confirmed" }
    );

    const program = new Program(idl as any, provider);
    const configPDA = getConfigPDA();

    const sig = await program.methods
      .initializeConfig(new PublicKey(authorityPubkey))
      .accounts({
        config: configPDA,
        signer: deployer.publicKey,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();

    return NextResponse.json({ signature: sig });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
