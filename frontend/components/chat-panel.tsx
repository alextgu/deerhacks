"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type ChatPanelProps = {
  matchId: string;
  currentUserId: string;
};

const POLL_INTERVAL = 2000;

export function ChatPanel({ matchId, currentUserId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const latestTimestamp = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50
    );
  }, []);

  const fetchMessages = useCallback(
    async (after?: string): Promise<Message[]> => {
      const url = `/api/chat/${matchId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load messages");
      const { messages: msgs } = await res.json();
      return msgs as Message[];
    },
    [matchId]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const msgs = await fetchMessages();
        if (cancelled) return;
        setMessages(msgs);
        if (msgs.length > 0) {
          latestTimestamp.current = msgs[msgs.length - 1].created_at;
        }
        scrollToBottom();
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const newMsgs = await fetchMessages(latestTimestamp.current);
        if (cancelled || newMsgs.length === 0) return;
        setMessages((curr) => {
          const existingIds = new Set(curr.map((m) => m.id));
          const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
          if (fresh.length === 0) return curr;
          return [...curr, ...fresh];
        });
        latestTimestamp.current = newMsgs[newMsgs.length - 1].created_at;
        scrollToBottom();
      } catch {}
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId, fetchMessages, scrollToBottom]);

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
      latestTimestamp.current = message.created_at;
      scrollToBottom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-muted/30 p-8">
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-muted/30 p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Say hello!
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
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
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
      <div className="flex gap-2 border-t border-border p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && messages.length > 0 && (
        <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
