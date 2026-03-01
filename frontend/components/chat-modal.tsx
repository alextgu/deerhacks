"use client";

import { useEffect, useState, useCallback } from "react";
import { ChatPanel } from "./chat-panel";

type ChatModalProps = {
  matchId: string;
  currentUserId: string;
  matchBlurb?: string | null;
  onClose: () => void;
};

export function ChatModal({
  matchId,
  currentUserId,
  matchBlurb,
  onClose,
}: ChatModalProps) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    try {
      await fetch(`/api/chat/${matchId}`, { method: "PATCH" });
    } catch {
      // ignore
    }
    onClose();
  }, [matchId, onClose, closing]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black-50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* modal */}
      <div className="relative flex h-min-85 w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              Chat with your match
            </h2>
            {matchBlurb && (
              <p className="truncate text-xs text-muted-foreground" style={{ marginTop: "0.125rem" }}>
                {matchBlurb}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            className="ml-3 flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            style={{ width: "2rem", height: "2rem" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* chat body */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatPanel matchId={matchId} currentUserId={currentUserId} matchBlurb={matchBlurb} onMatchEnded={onClose} />
        </div>
      </div>
    </div>
  );
}
