# Depth First Social (DFS)

**Connect through shared thinking.** Match with people who think like you using your Gemini conversation history — no swiping, no quizzes. Built at DeerHacks 2025.

---

## What it does

- **Upload Gemini data** — Export your [Gemini Apps Activity](https://takeout.google.com) (JSON). We build a 6-axis interest profile (Creativity, Logic, Social, Tech, Writing, Science) and never store raw messages.
- **Find matches** — Set your intent (Hackathon partner, Friend, Co-founder, etc.) and get ranked matches via vector similarity (Snowflake).
- **Chat** — Open a private chat with a match. Chats expire after 10 minutes or when both users end the conversation; messages and match rows are deleted.
- **Token gallery** — Each time you update your Gemini data you earn a token. Your gallery shows every update; clicking a token opens your spider chart.

---

## Tech stack

| Layer        | Stack |
|-------------|--------|
| Frontend    | Next.js 16 (App Router), React 19, Auth0, Supabase (profiles, matches, messages, Realtime), Tailwind |
| Backend     | FastAPI, Python 3 — extract/scrub Gemini JSON, Snowflake connector, optional Solana minting |
| Data        | **Supabase**: profiles, matches, messages. **Snowflake**: user archetype vectors, cosine similarity / Cortex Search |
| Auth        | Auth0 → profile sync to Supabase (first_name, last_name, avatar, etc.) |
| Optional    | Solana (devnet) for wallet connect; Gemini API for match blurbs |

---

## Repo structure

```
deerhacks/
├── frontend/          # Next.js app (dashboard, matchmaker, chat, token gallery)
├── backend/           # FastAPI (Gemini extraction, /v2/archetype, Snowflake upsert)
├── solana-program/    # Anchor program (reputation / soulbound identity)
├── demo/              # Demo Gemini JSON + setup script for test users
├── docs/              # Architecture (Gemini → Snowflake pipeline)
└── frontend/supabase/migrations/   # SQL for profiles, matches, messages, upload_history
```

---

## Setup

### 1. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env
# Edit .env: Auth0, Supabase, Snowflake, Gemini, NEXT_PUBLIC_API_URL
npm install
npm run dev
```

Runs at **http://localhost:3000**.

**Required env (see `.env.example`):**

- **Auth0** — `AUTH0_SECRET`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `APP_BASE_URL`
- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Backend URL** — `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`)
- **Snowflake** (for matching) — `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`
- **Gemini** (match blurbs) — `GEMINI_API_KEY`

### 2. Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env: GEMINI_API_KEY, Snowflake vars
uvicorn main:app --reload --port 8000
```

Runs at **http://localhost:8000**. Used for archetype vector upsert (`POST /v2/archetype`) and optional Gemini extraction.

### 3. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in **SQL Editor** (or via CLI) from `frontend/supabase/migrations/`:
   - `profiles` (id, email, first_name, last_name, avatar_url, wallet_address, sol_balance, karma_score, archetype_scores, archetype, summary, **upload_history**, etc.)
   - `matches` (id, user_a, user_b, match_blurb, status, closed_by_user_a, closed_by_user_b, **expires_at**)
   - `messages` (id, match_id, sender_id, content, created_at)
   - Add `upload_history` (JSONB) and match expiry/close columns if not present (see migration filenames).

### 4. Snowflake (matching)

- Create a database/schema and tables (e.g. `USER_ARCHETYPES` with `user_id`, `server_id`, vector column).
- Backend and frontend use the same Snowflake credentials for embedding upsert and match search (cosine similarity or Cortex Search).
- See `docs/ARCHITECTURE_GEMINI_JSON_AND_VECTORS.md` and `frontend/lib/snowflake.ts` for the flow.

---

## Running the app

1. Start **backend**: `cd backend && uvicorn main:app --reload --port 8000`
2. Start **frontend**: `cd frontend && npm run dev`
3. Open **http://localhost:3000** → Sign up / Log in (Auth0) → Upload Gemini JSON → Generate chart → Find matches → Open chat.

---

## Features in the UI

- **Home** — Landing, nav (logo, Wallet, Log out / Log in, Sign up), hero, testimonials, CTA.
- **Dashboard** — Profile card (avatar, name, tokens link), Upload Data / My Chart tabs, **Your Tokens** gallery (each token opens the chart), Find My Match (modal with search and Connect → chat).
- **Chat** — Modal or `/chat/[matchId]`: messages via Supabase Realtime, End chat (both users close → match/messages deleted), 10‑minute expiry, countdown.

---

## License

MIT. Built at DeerHacks 2025.
