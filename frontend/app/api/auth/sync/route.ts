import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Auth0UserWithName } from "@/lib/user-display";

export async function POST() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 503 }
      );
    }

    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const u = session.user as Auth0UserWithName & { sub?: string };
    const { sub, email, name, picture } = u;
    const givenName = u.given_name ?? null;
    const familyName = u.family_name ?? null;

    if (!sub) {
      return NextResponse.json({ error: "Auth0 user has no sub" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: sub,
          email: email ?? "",
          name: name ?? null,
          first_name: givenName,
          last_name: familyName,
          avatar_url: picture ?? null,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
