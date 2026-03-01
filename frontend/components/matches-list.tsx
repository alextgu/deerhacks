"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { ChatModal } from "./chat-modal";

type Match = {
  id: string;
  user_a: string;
  user_b: string;
  match_blurb: string | null;
  status: string | null;
};

export function MatchesList() {
  const { user } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);

  const fetchMatches = useCallback(async () => {
    if (!user?.sub) return;
    setLoading(true);
    try {
      const res = await fetch("/api/matches");
      if (!res.ok) return;
      const { matches: data } = await res.json();
      setMatches(data ?? []);
    } catch {} finally {
      setLoading(false);
    }
  }, [user?.sub]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        Loading matches…
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        No matches yet.
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 w-full max-w-md space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Your Matches</h2>
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenMatch(m)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {m.match_blurb ?? "New match"}
              </p>
              <p className="text-xs text-muted-foreground" style={{ marginTop: "0.125rem" }}>
                {m.status ?? "pending"}
              </p>
            </div>
            <svg
              className="ml-2 shrink-0 text-muted-foreground"
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </button>
        ))}
      </div>

      {openMatch && (
        <ChatModal
          matchId={openMatch.id}
          currentUserId={user.sub!}
          matchBlurb={openMatch.match_blurb}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </>
  );
}
