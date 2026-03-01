# Sync user archetype vector to Snowflake (after Gemini onboarding)

This folder documents how to push a user's 768-dim archetype vector to Snowflake `user_archetypes` when the Gemini onboarding flow completes, so Cortex Search can match them.

## Option A: Call Next.js API from the frontend (recommended)

When your Gemini onboarding completes in the app:

1. You already have the user's Auth0 session and the computed `archetype_vector` (768 floats).
2. Call your app's API with the session cookie so the backend can identify the user:

```ts
// After onboarding completes (e.g. in your onboarding success handler)
const res = await fetch("/api/profile/archetype-sync", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    serverId: currentServerId, // e.g. "hackathon" or your server slug
    vector: archetypeVector,   // number[768]
  }),
});
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  console.warn("Archetype sync failed", err);
}
```

No Supabase Edge Function is required; the Next.js API uses the Auth0 session and writes to Snowflake via `lib/snowflake.ts` (`upsertUserArchetype`).

## Option B: Supabase Edge Function calling Next.js

If you prefer to trigger sync from Supabase (e.g. DB webhook or Auth hook):

1. **Create an Edge Function** that receives the user id and vector (e.g. from a Supabase table or webhook payload).
2. The Edge Function **cannot** run `snowflake-sdk` (Deno runtime). It should **HTTP POST** to your Next.js app:

   - URL: `https://<your-app>/api/profile/archetype-sync`
   - Body: `{ "serverId": "<server>", "vector": [ ... ] }`

3. **Authentication**: The Next.js route currently expects an **Auth0 session cookie**. So the caller must be the user's browser, or you need a server-to-server mechanism:
   - **Option B1**: Don’t use Edge for this; use Option A (frontend calls API after onboarding).
   - **Option B2**: Add a separate internal route (e.g. `POST /api/internal/archetype-sync`) protected by a shared secret header, and have the Edge Function call that with the user id + vector; the Next.js handler then uses the user id to write to Snowflake (no Auth0 cookie). You’d need to ensure the Edge Function is only invoked in a trusted way (e.g. from a Supabase DB webhook with a secret).

## Option C: Script (e.g. cron or one-off)

For batch or backfill, run a Node script that uses the same Snowflake connection and `upsertUserArchetype`:

- Read users (and their 768-dim vectors) from Supabase `profiles` (e.g. `archetype_vector`, `id`).
- For each user and server, call `upsertUserArchetype(auth0Id, serverId, vector)` from `lib/snowflake.ts` (or call `POST /api/profile/archetype-sync` with a valid session if you have one).

## Environment

Ensure `frontend/.env.local` has:

- `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`

Snowflake table `user_archetypes` must have columns: `auth0_id`, `server_id`, `embedding` (VECTOR(FLOAT, 768)), `updated_at`, and (for Cortex Search) ATTRIBUTES including `server_id` and `is_flagged` if you use the Cortex Search Service.
