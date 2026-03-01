# Architecture: Unified Snowflake-Cortex Pipeline

This doc describes the **integrated flow** where all vector extraction, storage, and matching run through Snowflake. The backend is a "pass-through" that scrubs and stores text; Snowflake generates 768-dim embeddings via Cortex.

---

## 1. What "Gemini JSON" is

- **Source**: User exports **Gemini Apps Activity** from [takeout.google.com](https://takeout.google.com) → download contains a JSON file (e.g. `MyActivity.json`).
- **Format**: Array of entries; each has `title` (e.g. `"Prompted <user message>"`), `time`, etc. Only the **user's prompts** are used.
- **Purpose**: Raw messages are scrubbed, stored in Snowflake, and embedded via Cortex. The raw file is not stored.

---

## 2. The Integrated Flow

```
User: takeout.google.com → MyActivity.json
            │
            ▼
Frontend Upload UI → POST backend /extract (file + user_id + server_id)
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: POST /extract                                         │
│  1. extract_user_messages()  → parse "Prompted ..." from JSON   │
│  2. scrub_pii()              → redact email, phone, URLs        │
│  3. build_corpus()           → concatenate (~40k chars max)     │
│  4. upsert_raw_corpus()      → Snowflake RAW_USER_ONBOARDING   │
│  5. embed_and_upsert_archetype() →                             │
│     SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m') │
│     → MERGE INTO USER_ARCHETYPES (768-dim embedding)           │
│                                                                 │
│  Returns: { success, message_count, corpus_length }             │
│  No 50-dim vector; Snowflake is the source of truth.           │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Snowflake (Source of Truth)                                    │
│                                                                 │
│  RAW_USER_ONBOARDING: auth0_id, cleaned_corpus, updated_at     │
│  USER_ARCHETYPES: auth0_id, server_id, embedding(768),         │
│                   archetype_label, is_flagged, updated_at       │
│                                                                 │
│  ARCHETYPE_MATCH_SERVICE (Cortex Search):                       │
│    Vector index on embedding, attributes: server_id, is_flagged │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Matching (both backend & frontend use Cortex Search)           │
│                                                                 │
│  Frontend: GET /api/matches?server_id=xxx                       │
│    1. getUserEmbedding(auth0_id) → Snowflake                   │
│    2. findSmartMatches(vector, serverId) → SEARCH_PREVIEW       │
│    3. Fetch archetype_json from Supabase for blurbs            │
│    4. Gemini icebreaker generation                              │
│                                                                 │
│  Backend: POST /v2/match                                        │
│    use_cortex=true → Cortex Search only (768-dim, same as FE)  │
│    use_cortex=false → legacy 50-dim SQL + Python re-rank        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Comparison: Old vs New

| Feature | Old Path | New Integrated Path |
|---------|----------|---------------------|
| **Vector Extraction** | Python (Gemini → 50-dim) | Snowflake Cortex (`EMBED_TEXT_768` → 768-dim) |
| **Data Processing** | In-memory Python | Snowflake Table + SQL |
| **Storage** | Supabase → manual Snowflake sync | Snowflake (Source of Truth) |
| **Matching Engine** | Python Re-rank (50-dim) + separate Cortex Search (768-dim) | Cortex Search (Hybrid, unified 768-dim) |
| **Backend /extract** | Returns 50-dim vector | Scrubs text, stores corpus, triggers Cortex embedding |

---

## 4. Key files

| What | Where |
|------|-------|
| Backend: accept Takeout file, scrub, store corpus, trigger embedding | `backend/main.py` → `POST /extract`; `backend/matching/matching_engine.py` (`upsert_raw_corpus`, `embed_and_upsert_archetype`) |
| Backend: legacy 50-dim extraction (kept for compatibility) | `backend/main.py` → `POST /extract/legacy`; `backend/matching/vector_extraction.py` |
| Backend: store 50-dim in Snowflake (legacy) | `backend/main.py` → `POST /v2/archetype`; `matching_engine.py` (`upsert_archetype`) |
| Backend: match via Cortex (768-dim) | `POST /v2/match` with `use_cortex: true`; `matching_engine.get_matches_cortex()` |
| Backend: legacy match (50-dim + re-rank) | `POST /v2/match` with `use_cortex: false`; `matching_engine.get_matches()` |
| Frontend: unified Cortex Search matching | `frontend/app/api/matches/route.ts`; `frontend/lib/snowflake.ts` (`findSmartMatches`, `getUserEmbedding`) |
| Frontend: trigger re-embed | `frontend/app/api/profile/archetype-sync/route.ts`; `frontend/lib/snowflake.ts` (`triggerEmbed`) |
| Frontend: Gemini blurbs | `frontend/lib/gemini-blurb.ts` |
| Snowflake DDL & setup | `frontend/supabase/migrations/README_SNOWFLAKE.md` |

---

## 5. Data shapes

**Raw corpus** (in `raw_user_onboarding`):
Plain text, PII-scrubbed, up to ~40k characters of concatenated user prompts.

**768-dim embedding** (in `user_archetypes`):
Generated by `SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', corpus)`.
Single representation used for all matching (backend and frontend).

**Supabase `profiles`** still holds:
- `archetype_json` — structured personality metadata for Gemini blurb generation.
- `summary` — text summary for blurb fallback.
- These are *not* used for vector matching; only for generating human-readable icebreakers.
