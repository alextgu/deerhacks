import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { triggerEmbed } from "@/lib/snowflake";

/**
 * POST /api/profile/archetype-sync
 * Triggers Snowflake to (re-)generate the 768-dim embedding for the
 * current user from their cleaned_corpus in raw_user_onboarding.
 *
 * In the new flow the backend /extract endpoint already handles this
 * automatically, so this is primarily a fallback / re-trigger.
 *
 * Body: { serverId?: string }   (defaults to "general")
 * Requires Auth0 session.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession(req);
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const serverId =
      typeof body.serverId === "string"
        ? body.serverId
        : typeof body.server_id === "string"
          ? body.server_id
          : "general";

    await triggerEmbed(session.user.sub, serverId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embed trigger failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
