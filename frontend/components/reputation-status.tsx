"use client";

import { useEffect, useState } from "react";
import { useReputation } from "@/lib/solana/use-reputation";
import type { UserIdentity } from "@/lib/solana/use-reputation";

export function ReputationStatus() {
  const {
    loadUserIdentity,
    initializeUser,
    txPending,
    error,
    clearError,
    connected,
  } = useReputation();
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) {
      setIdentity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadUserIdentity()
      .then(setIdentity)
      .finally(() => setLoading(false));
  }, [connected, loadUserIdentity]);

  const handleCreateIdentity = async () => {
    const sig = await initializeUser("builder", [
      { name: "coding", weight: 80 },
      { name: "design", weight: 20 },
    ]);
    if (sig) {
      const next = await loadUserIdentity();
      setIdentity(next ?? null);
    }
  };

  if (!connected) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error && (
        <button
          type="button"
          onClick={clearError}
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error} (dismiss)
        </button>
      )}
      {loading ? (
        <span className="text-sm text-zinc-500">Loading reputation…</span>
      ) : identity ? (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Karma: <strong>{identity.karma}</strong>
          {identity.isFlagged && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              (flagged)
            </span>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleCreateIdentity}
          disabled={txPending}
          className="text-sm font-medium text-zinc-600 underline disabled:opacity-50 dark:text-zinc-400"
        >
          {txPending ? "Creating…" : "Create on-chain identity"}
        </button>
      )}
    </div>
  );
}
