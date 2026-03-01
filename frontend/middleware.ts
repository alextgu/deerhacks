import type { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

/**
 * Auth0 v4: login, callback, logout and session handling are done by this middleware.
 * Without it, /auth/login and /auth/callback would not run and signup would not link to Supabase.
 */
export async function middleware(request: NextRequest) {
  return auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
