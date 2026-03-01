import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ matchId: string }> };

async function verifyParticipant(matchId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("matches")
    .select("user_a, user_b")
    .eq("id", matchId)
    .single();

  if (!data) return false;
  return data.user_a === userId || data.user_b === userId;
}

/** GET match metadata: expiry, status, who closed (for UI countdown and "Chat ended"). */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { matchId } = await ctx.params;
    if (!(await verifyParticipant(matchId, session.user.sub))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("user_a, user_b, status, closed_by_user_a, closed_by_user_b, expires_at, created_at")
      .eq("id", matchId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Match not found" }, { status: 404 });
    }

    const row = data as {
      user_a: string;
      user_b: string;
      status: string | null;
      closed_by_user_a: boolean | null;
      closed_by_user_b: boolean | null;
      expires_at: string | null;
      created_at: string | null;
    };
    const isUserA = row.user_a === session.user.sub;
    const closedByMe = isUserA ? row.closed_by_user_a : row.closed_by_user_b;
    const closedByOther = isUserA ? row.closed_by_user_b : row.closed_by_user_a;
    const now = new Date();
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const isExpired = expiresAt ? now >= expiresAt : false;
    const isClosed = row.status === "closed" || (closedByMe && closedByOther);

    return NextResponse.json({
      status: row.status,
      expires_at: row.expires_at,
      closed_by_me: closedByMe ?? false,
      closed_by_other: closedByOther ?? false,
      is_expired: isExpired,
      is_ended: isClosed || isExpired,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH close: mark current user as closed; if both closed, set status to "closed". */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { matchId } = await ctx.params;
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("user_a, user_b, closed_by_user_a, closed_by_user_b, status")
      .eq("id", matchId)
      .single();

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const row = match as {
      user_a: string;
      user_b: string;
      closed_by_user_a: boolean | null;
      closed_by_user_b: boolean | null;
      status: string | null;
    };
    const isParticipant = row.user_a === session.user.sub || row.user_b === session.user.sub;
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isUserA = row.user_a === session.user.sub;
    const updates: { closed_by_user_a?: boolean; closed_by_user_b?: boolean; status?: string } = {};
    if (isUserA) {
      updates.closed_by_user_a = true;
    } else {
      updates.closed_by_user_b = true;
    }

    const otherClosed = isUserA ? row.closed_by_user_b : row.closed_by_user_a;
    if (otherClosed) {
      updates.status = "closed";
    }

    const { data: updated, error } = await supabaseAdmin
      .from("matches")
      .update(updates)
      .eq("id", matchId)
      .select("status, closed_by_user_a, closed_by_user_b")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const u = updated as { status: string; closed_by_user_a: boolean; closed_by_user_b: boolean };
    return NextResponse.json({
      closed: true,
      match_ended: u.status === "closed",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
