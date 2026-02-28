import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { auth0 } from './auth0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server/async: get Supabase client with the current Auth0 access token (for RLS). */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  const { token } = await auth0.getAccessToken();
  return createSupabaseClient(token);
}

/** Create a Supabase client with an Auth0 access token (e.g. from API for client-side use). */
export function createSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
