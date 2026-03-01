/**
 * Server-only: upsert Supabase profiles from Auth0 user.
 * Used in Auth0 beforeSessionSaved (callback) and in POST /api/auth/sync.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";

export type Auth0UserForSync = {
  sub?: string;
  email?: string | null;
  name?: string | null;
  nickname?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
};

/**
 * Extract first_name / last_name from Auth0 claims.
 * Priority: given_name/family_name > split "name" > email prefix > null.
 */
function extractNames(user: Auth0UserForSync): {
  first_name: string | null;
  last_name: string | null;
} {
  if (user.given_name) {
    return {
      first_name: user.given_name,
      last_name: user.family_name ?? null,
    };
  }

  if (user.name && user.name.trim().includes(" ")) {
    const parts = user.name.trim().split(/\s+/);
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
    };
  }

  if (user.name) {
    return { first_name: user.name, last_name: null };
  }

  if (user.nickname) {
    return { first_name: user.nickname, last_name: null };
  }

  if (user.email) {
    const local = user.email.split("@")[0];
    return { first_name: local, last_name: null };
  }

  return { first_name: null, last_name: null };
}

export async function upsertProfileFromAuth0User(
  user: Auth0UserForSync
): Promise<{ profile: unknown } | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      error:
        "Supabase not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
      status: 503,
    };
  }

  const sub = user.sub;
  if (!sub) {
    return { error: "Auth0 user has no sub", status: 400 };
  }

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("id", sub)
    .single();

  if (existing) {
    const updates: Record<string, unknown> = {
      email: user.email ?? "",
      avatar_url: user.picture ?? null,
    };

    const hasRealName = existing.first_name && !existing.first_name.includes("@");
    if (!hasRealName && user.given_name) {
      updates.first_name = user.given_name;
      updates.last_name = user.family_name ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", sub)
      .select()
      .single();

    if (error) return { error: error.message, status: 500 };
    return { profile: data };
  }

  const { first_name, last_name } = extractNames(user);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: sub,
      email: user.email ?? "",
      first_name,
      last_name,
      avatar_url: user.picture ?? null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }
  return { profile: data };
}
