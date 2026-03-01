import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local"
    );
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — only use in API routes / server components
 * after verifying the Auth0 session.
 * Throws at first use if env vars are missing.
 */
export const supabaseAdmin = getSupabaseAdmin();
