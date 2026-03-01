import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { upsertProfileFromAuth0User } from "@/lib/supabase-sync-auth0";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email",
  },
  beforeSessionSaved: async (session) => {
    const result = await upsertProfileFromAuth0User(session.user);
    if ("error" in result && process.env.NODE_ENV === "development") {
      console.warn("[Auth0→Supabase sync]", result.error);
    }
    return session;
  },
});
