import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { upsertProfileFromAuth0User } from "@/lib/supabase-sync-auth0";

/**
 * POST /api/auth/sync — sync current Auth0 session to Supabase profiles.
 * Session is also synced server-side in Auth0 beforeSessionSaved; this endpoint
 * allows the client to retry or refresh the profile after login.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await upsertProfileFromAuth0User(session.user);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status as 400 | 500 | 503 }
      );
    }
    return NextResponse.json({ profile: result.profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
