import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ matchId: string }> };

async function getMatch(matchId: string) {
  const { data } = await supabaseAdmin
    .from("matches")
    .select("user_a, user_b, status, expires_at")
    .eq("id", matchId)
    .single();
  return data as { user_a: string; user_b: string; status: string | null; expires_at: string | null } | null;
}

async function verifyParticipant(matchId: string, userId: string) {
  const data = await getMatch(matchId);
  if (!data) return false;
  return data.user_a === userId || data.user_b === userId;
}

function isMatchEnded(match: { status: string | null; expires_at: string | null } | null) {
  if (!match) return true;
  if (match.status === "closed") return true;
  if (match.expires_at && new Date(match.expires_at) <= new Date()) return true;
  return false;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { matchId } = await ctx.params;
    const match = await getMatch(matchId);
    if (!(match && (match.user_a === session.user.sub || match.user_b === session.user.sub))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const after = req.nextUrl.searchParams.get("after");

    let query = supabaseAdmin
      .from("messages")
      .select("id, match_id, sender_id, content, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (after) {
      query = query.gt("created_at", after);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { matchId } = await ctx.params;
    const match = await getMatch(matchId);
    if (!(match && (match.user_a === session.user.sub || match.user_b === session.user.sub))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isMatchEnded(match)) {
      return NextResponse.json({ error: "Chat has ended or expired" }, { status: 410 });
    }

    const body = await req.json();
    const content = (body.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        match_id: matchId,
        sender_id: session.user.sub,
        content,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
