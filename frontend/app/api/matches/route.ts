import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findSmartMatches, getUserEmbedding } from "@/lib/snowflake";
import {
  generateMatchBlurbFromArchetypes,
  generateMatchBlurb,
} from "@/lib/gemini-blurb";

const DEFAULT_TOP_N = 3;
const MAX_TOP_N = 20;

/**
 * GET /api/matches
 * - No query params: returns existing matches for the current user (Supabase).
 * - ?server_id=xxx: discovery — fetch user's 768-dim embedding from Snowflake,
 *   call Cortex Search with server_id filter and is_flagged=FALSE.
 * - ?top_n=N: override number of matches (default 3, max 20).
 * - ?context=hackathon,friend: comma-separated match type labels (passed to blurb gen).
 * All paths require Auth0 session.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth0.getSession(req);
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.sub;
    const serverId = req.nextUrl.searchParams.get("server_id");
    const topNParam = req.nextUrl.searchParams.get("top_n");
    const contextParam = req.nextUrl.searchParams.get("context");
    const topN = Math.min(
      Math.max(1, parseInt(topNParam ?? "", 10) || DEFAULT_TOP_N),
      MAX_TOP_N
    );

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

    let vector = await getUserEmbedding(userId, serverId);
    if (!vector && serverId !== "general") {
      vector = await getUserEmbedding(userId, "general");
    }
    if (!vector) {
      return NextResponse.json(
        {
          error:
            "Embedding not found in Snowflake. Upload your Takeout data first.",
        },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("archetype_json, summary")
      .eq("id", userId)
      .single();

    const userArchetype =
      (profile as { archetype_json?: string | Record<string, unknown> } | null)
        ?.archetype_json ?? null;
    const userSummary =
      (profile as { summary?: string } | null)?.summary ?? "";

    const blurbContext = contextParam || serverId;

    let matchedAuth0Ids: string[];
    try {
      matchedAuth0Ids = await findSmartMatches(vector, serverId, topN);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Snowflake Cortex Search error";
      return NextResponse.json(
        { error: "Matching unavailable", details: msg },
        { status: 503 }
      );
    }

    const excludeSelf = matchedAuth0Ids.filter((id) => id !== userId);
    if (excludeSelf.length === 0) {
      return NextResponse.json({ suggestedMatches: [] });
    }

    const { data: matchedProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, archetype_json, summary")
      .in("id", excludeSelf);

    const suggestedMatches = await Promise.all(
      (matchedProfiles ?? []).map(async (p) => {
        const matchArchetype =
          (p as { archetype_json?: string | Record<string, unknown> })
            .archetype_json ?? null;
        const matchSummary = (p as { summary?: string }).summary ?? "";
        let matchBlurb = "You two should connect.";
        try {
          if (userArchetype || matchArchetype) {
            matchBlurb = await generateMatchBlurbFromArchetypes(
              userArchetype,
              matchArchetype,
              blurbContext
            );
          } else {
            matchBlurb = await generateMatchBlurb(
              userSummary,
              matchSummary,
              blurbContext
            );
          }
        } catch {
          // keep default
        }
        return {
          auth0_id: p.id,
          archetype_json: matchArchetype,
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
