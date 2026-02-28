"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  initializeUser as initUser,
  awardKarma as awardKarmaTx,
  endorseSkill as endorseSkillTx,
  fetchUserIdentity,
  type SkillWeight,
} from "./program";

export type UserIdentity = Awaited<ReturnType<typeof fetchUserIdentity>>;

export function useReputation() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const initializeUser = useCallback(
    async (archetype: string, skillWeights: SkillWeight[]) => {
      if (!wallet.publicKey) {
        setError("Wallet not connected");
        return null;
      }
      setTxPending(true);
      setError(null);
      try {
        const sig = await initUser(connection, wallet, archetype, skillWeights);
        return sig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setError(msg);
        return null;
      } finally {
        setTxPending(false);
      }
    },
    [connection, wallet]
  );

  const awardKarma = useCallback(
    async (recipientWallet: PublicKey | string, rating: number) => {
      if (!wallet.publicKey) {
        setError("Wallet not connected");
        return null;
      }
      const recipient =
        typeof recipientWallet === "string"
          ? new PublicKey(recipientWallet)
          : recipientWallet;
      setTxPending(true);
      setError(null);
      try {
        const sig = await awardKarmaTx(connection, wallet, recipient, rating);
        return sig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setError(msg);
        return null;
      } finally {
        setTxPending(false);
      }
    },
    [connection, wallet]
  );

  const endorseSkill = useCallback(
    async (recipientWallet: PublicKey | string, skillName: string) => {
      if (!wallet.publicKey) {
        setError("Wallet not connected");
        return null;
      }
      const recipient =
        typeof recipientWallet === "string"
          ? new PublicKey(recipientWallet)
          : recipientWallet;
      setTxPending(true);
      setError(null);
      try {
        const sig = await endorseSkillTx(
          connection,
          wallet,
          recipient,
          skillName
        );
        return sig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setError(msg);
        return null;
      } finally {
        setTxPending(false);
      }
    },
    [connection, wallet]
  );

  const loadUserIdentity = useCallback(
    async (walletPubkey?: PublicKey) => {
      const pubkey = walletPubkey ?? wallet.publicKey ?? null;
      if (!pubkey) return null;
      return fetchUserIdentity(connection, pubkey);
    },
    [connection, wallet.publicKey]
  );

  return {
    initializeUser,
    awardKarma,
    endorseSkill,
    loadUserIdentity,
    txPending,
    error,
    clearError,
    connected: !!wallet.publicKey,
  };
}
