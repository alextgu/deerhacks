"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type MatchMeta = {
  status: string;
  expires_at: string | null;
  closed_by_me: boolean;
  closed_by_other: boolean;
  is_expired: boolean;
  is_ended: boolean;
};

type ChatPanelProps = {
  matchId: string;
  currentUserId: string;
  matchBlurb?: string | null;
  onMatchEnded?: () => void;
};

export function ChatPanel({ matchId, currentUserId, matchBlurb, onMatchEnded }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50
    );
  }, []);

  // Fetch match metadata (expiry, closed status)
  useEffect(() => {
    let cancelled = false;
    async function fetchMeta() {
      try {
        const res = await fetch(`/api/chat/${matchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setMeta(data);
        if (data.is_ended && onMatchEnded) onMatchEnded();
      } catch {
        // ignore
      }
    }
    fetchMeta();
    return () => { cancelled = true; };
  }, [matchId, onMatchEnded]);

  // Countdown and auto-close when expired
  useEffect(() => {
    if (!meta?.expires_at || meta.is_ended) return;
    const expiresAt = new Date(meta.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && onMatchEnded) onMatchEnded();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [meta?.expires_at, meta?.is_ended, onMatchEnded]);

  // Initial fetch via REST (gets full history)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(`/api/chat/${matchId}/messages`);
        if (!res.ok) throw new Error("Failed to load messages");
        const { messages: msgs } = await res.json();
        if (cancelled) return;
        setMessages(msgs as Message[]);
        scrollToBottom();
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [matchId, scrollToBottom]);

  // Supabase Realtime — subscribe to broadcast channel scoped to match_id
  useEffect(() => {
    const channel = supabase.channel(`chat:${matchId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "new_message" }, (payload) => {
        const msg = payload.payload as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, scrollToBottom]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    setError(null);

    try {
      const res = await fetch(`/api/chat/${matchId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const { error: errMsg } = await res.json();
        setError(errMsg ?? "Send failed");
        return;
      }

      const { message } = await res.json();

      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      scrollToBottom();

      // Broadcast to the other participant via Supabase Realtime
      const channel = supabase.channel(`chat:${matchId}`);
      await channel.send({
        type: "broadcast",
        event: "new_message",
        payload: message,
      });
      supabase.removeChannel(channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const isEnded = meta?.is_ended ?? false;
  const expired = meta?.is_expired ?? false;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-muted-30 p-8">
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-muted-30 p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const countdownLabel =
    secondsLeft !== null && secondsLeft > 0
      ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
      {/* Icebreaker blurb — always visible at top */}
      {matchBlurb && (
        <div className="border-b border-border bg-muted-30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground" style={{ marginBottom: "0.25rem" }}>
            Why you two should connect
          </p>
          <p className="text-sm text-foreground">{matchBlurb}</p>
        </div>
      )}

      {/* Expiry / ended banner */}
      {(countdownLabel || isEnded) && (
        <div
          className={`border-b border-border px-4 py-2 text-center text-xs font-medium ${
            isEnded ? "bg-muted-30 text-muted-foreground" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {isEnded
            ? expired
              ? "Chat expired. This conversation is closed."
              : "Chat ended. Both of you closed this conversation."
            : countdownLabel}
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        {messages.length === 0 && !isEnded && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </p>
        )}
        {messages.length === 0 && isEnded && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages in this chat.
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`mb-2 flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-85 rounded-lg px-3 py-2 text-sm ${
                  isOwn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* Input — hidden when chat ended */}
      {!isEnded && (
        <div className="flex gap-2 border-t border-border p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            className="flex-1-input rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            style={sending ? { opacity: 0.5 } : undefined}
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-90"
            style={sending || !input.trim() ? { opacity: 0.5 } : undefined}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
      {error && messages.length > 0 && (
        <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
