"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black-50 backdrop-blur-sm"
        onClick={onClose}
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
            onClick={onClose}
            className="ml-3 flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <ChatPanel matchId={matchId} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
