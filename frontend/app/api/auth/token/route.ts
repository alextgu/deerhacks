import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

/**
 * Returns the current user's Auth0 access token for use with Supabase RLS.
 * Call from the client to create an authenticated Supabase client.
 */
export async function GET() {
  try {
    const { token } = await auth0.getAccessToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}
