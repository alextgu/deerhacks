import { redirect } from "next/navigation";
import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ChatPanel } from "@/components/chat-panel";

type Match = {
  id: string;
  user_a: string;
  user_b: string;
  server_id: string | null;
  match_blurb: string | null;
  status: string | null;
};

export default async function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const session = await auth0.getSession();
  if (!session?.user?.sub) {
    redirect("/");
  }
  const currentUserId = session.user.sub;

  const { data: match, error } = await supabaseAdmin
    .from("matches")
    .select("id, user_a, user_b, server_id, match_blurb, status")
    .eq("id", matchId)
    .single();

  if (error || !match) {
    redirect("/");
  }

  const row = match as Match;
  const isParticipant =
    row.user_a === currentUserId || row.user_b === currentUserId;
  if (!isParticipant) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground-link"
          >
            ← Back
          </Link>
          <div className="flex-1 px-4 text-center">
            <h1 className="text-sm font-semibold text-foreground">
              Chat with your match
            </h1>
            {row.match_blurb && (
              <p className="truncate text-xs text-muted-foreground" style={{ marginTop: "0.125rem" }}>
                {row.match_blurb}
              </p>
            )}
          </div>
          <div className="w-12" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4">
        <ChatPanel matchId={matchId} currentUserId={currentUserId} />
      </main>
    </div>
  );
}
