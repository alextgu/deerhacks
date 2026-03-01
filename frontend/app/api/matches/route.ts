import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findMatches } from "@/lib/snowflake";
import { generateMatchBlurb } from "@/lib/gemini-blurb";

const SNOWFLAKE_VECTOR_DIM = 768;

function toVector768(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const nums = raw.map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length >= SNOWFLAKE_VECTOR_DIM) return nums.slice(0, SNOWFLAKE_VECTOR_DIM);
    return [...nums, ...Array(SNOWFLAKE_VECTOR_DIM - nums.length).fill(0)];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as number[];
      return toVector768(parsed);
    } catch {
      return Array(SNOWFLAKE_VECTOR_DIM).fill(0);
    }
  }
  return Array(SNOWFLAKE_VECTOR_DIM).fill(0);
}

/**
 * GET /api/matches
 * - No query: returns existing matches for the current user (Supabase).
 * - ?server_id=xxx: discovery flow — fetch user vector, flagged users, Snowflake findMatches, Gemini blurbs.
 * All paths require Auth0 session.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.sub;
    const serverId = req.nextUrl.searchParams.get("server_id");

    if (!serverId) {
      const { data, error } = await supabaseAdmin
        .from("matches")
        .select("id, user_a, user_b, match_blurb, status, created_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ matches: data ?? [] });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("archetype_vector, summary")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile or vector not found. Complete your profile first." },
        { status: 400 }
      );
    }

    const vector = toVector768(profile.archetype_vector);
    const currentSummary = (profile as { summary?: string }).summary ?? "";

    const { data: flaggedRows } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_flagged", true);
    const flaggedIds = (flaggedRows ?? []).map((r) => r.id as string);

    let matchedAuth0Ids: string[];
    try {
      matchedAuth0Ids = await findMatches(serverId, vector, [...flaggedIds, userId]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Snowflake error";
      return NextResponse.json(
        { error: "Matching unavailable", details: msg },
        { status: 503 }
      );
    }

    if (matchedAuth0Ids.length === 0) {
      return NextResponse.json({ suggestedMatches: [] });
    }

    const { data: matchedProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, summary")
      .in("id", matchedAuth0Ids);

    const suggestedMatches = await Promise.all(
      (matchedProfiles ?? []).map(async (p) => {
        const matchSummary = (p as { summary?: string }).summary ?? "";
        let matchBlurb = "You two should connect.";
        try {
          matchBlurb = await generateMatchBlurb(currentSummary, matchSummary, "server");
        } catch {
          // keep default blurb
        }
        return {
          auth0_id: p.id,
          summary: matchSummary,
          match_blurb: matchBlurb,
        };
      })
    );

    return NextResponse.json({ suggestedMatches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
