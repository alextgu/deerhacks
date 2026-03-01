# Depth-First Social
### Find yourself. Find your people.

Built at DeerHacks 2026.

---

## The Idea

When you connect with someone on LinkedIn, they see the cracked persona you've curated for yourself. When you match with someone on Tinder, they see your photos and a few fun facts that you've chosen. Every single profile you have is a 1-dimensional self-construction. How could that ever be the real you?

This is where the LLMs come in. When you're debugging on Claude at 3AM in the morning, you are *not* performing. When you're ranting about life to seek validation from ChatGPT, you're not holding back. You're not afraid to be judged. You express yourself. You ask the selfish questions. You are unfiltered, presenting the absolute realest version of yourself.

We encapsulate this purity, compounded over years of conversation, and open the door for some very heavy introspection. Then, securely, we connect you with compatible individuals. You can find friends, mentors, find teammates, even dates — all made possible by our various algorithms purpose-built for each use case.

Say your emotional bandwidth when using LLMs is minimal. You only ever use it to study or to code. Our vectorized persona of you would still be intensely fruitful, based on your cognitive style and building processes. Your LLM knows if you're detail-oriented, indecisive, or an abstract thinker. It has noticed if you like to ship iteratively, build clean architecture, or rely a *bit* too heavily on Copilot. This goes to show that the possibilities for DFS are endless. If you're not interested in romance, it'll bring you to a team of hackers, a study buddy, or even a co-founder.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js, Auth0, shadcn/ui |
| Backend | FastAPI (Python) |
| Database | Supabase |
| Data warehouse | Snowflake |k
| AI / Extraction | Gemini 2.5 Flash |
| Blockchain | Solana (Anchor) |

---

## Project Structure

```
deerhacks/
├── backend/
│   ├── main.py                  # FastAPI server — all endpoints
│   ├── requirements.txt
│   └── matching/
│       ├── vector_extraction.py # Google Takeout → 50-variable personality vector
│       ├── matching.py          # Context-aware compatibility scoring engine
│       ├── features.py          # All product features (portrait, blurb, blind spot, etc.)
│       ├── spider_chart.py      # Radar chart visualization (matplotlib reference impl)
│       └── extra_charts.py      # Growth over time + 4-way team overlay charts
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   └── api/solana/          # Solana API routes
│   ├── components/
│   │   ├── auth-button.tsx
│   │   ├── reputation-status.tsx
│   │   ├── solana-provider.tsx
│   │   └── wallet-connect.tsx
│   └── lib/
│       ├── auth0.ts
│       ├── supabase.ts
│       └── solana/              # Solana program client
└── solana-program/              # Anchor smart contract
    └── programs/solana-program/
        └── src/lib.rs
```

---

## Getting Started

### Backend

```bash
cd backend
cp ../.env .env          # copy root .env which contains GEMINI_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
cp .env.example .env.local
# fill in your Supabase, Auth0, and Solana values
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

### Environment Variables

**Root `.env`:**
```
GEMINI_API_KEY=your_key_here
```

**`frontend/.env.local`:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
AUTH0_SECRET=...
AUTH0_BASE_URL=...
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

---

## API Endpoints

All endpoints accept and return JSON. Full interactive docs at `/docs`.

| Endpoint | Method | Description |
|---|---|---|
| `/extract` | POST | Upload Google Takeout JSON → personality vector |
| `/portrait` | POST | Self-portrait data for radar chart |
| `/portrait/blind-spot` | POST | Hidden strengths + honest growth edges (Gemini) |
| `/portrait/growth` | POST | Compare two snapshots over time |
| `/match` | POST | Single-context compatibility score |
| `/match/all-contexts` | POST | Score across all 3 contexts simultaneously |
| `/match/blurb` | POST | "Why you two should connect" (Gemini) |
| `/match/red-flags` | POST | Private friction warnings |
| `/match/relationship-type` | POST | Natural dynamic between two people |
| `/match/opening-message` | POST | Gemini-drafted icebreaker |
| `/match/group` | POST | Optimal team assembly from a pool |
| `/quiz/generate` | POST | "How well do you know me" quiz (Gemini) |

---

## The Personality Vector

50 variables across 6 dimensions, each scored 0.0–1.0:

- **Cognitive Style** — abstract thinking, systems thinking, novelty seeking, detail orientation, decisiveness, pattern recognition, risk tolerance, contrarianism, depth vs breadth
- **Emotional Profile** — expressiveness, hotheadedness, empathy, self-criticism, confidence oscillation, optimism, vulnerability, neediness, intensity, frustration tolerance
- **Collaboration & Work** — leadership drive, structure need, feedback receptivity, execution bias, async preference, ownership taking, perfectionism, collaboration enjoyment, adaptability, deadline orientation
- **Values & Motivation** — intrinsic motivation, impact orientation, ambition, ethical sensitivity, competitiveness, loyalty, independence value, intellectual humility, long-term thinking
- **Communication** — directness, verbosity, humor frequency, humor style, question-asking rate, formality, storytelling tendency
- **Identity & Lifestyle** — social energy, routine vs spontaneity, creative drive, physical lifestyle, life pace

---

## Matching Algorithm

Each variable is configured with a mode (`similarity` or `complement`) and context-specific weights across hackathon, romantic, and friendship contexts. The engine computes:

1. Per-variable weighted scores
2. Dimension rollups
3. Clash penalties (e.g. two hotheads with low feedback receptivity)
4. Bonus rules (e.g. both high intellectual humility)
5. Final score 0–1, graded A+ to D

---

## Solana Integration

- **Reputation staking** — users stake SOL on their own behavior; poor ratings slash stake
- **Abandonment penalties** — escrow system discourages ghosting after matching
- **NFT portraits** — spider charts minted as soulbound NFTs, timestamped and tamper-proof

---

## Team

Built in 30 hours at DeerHacks 2026, University of Toronto Mississauga.

- **Akash** — matching algorithm, vector extraction, FastAPI backend
- **Alex** — Supabase, Snowflake, Solana integration
- **Saket** — frontend, UI/UX
- **Sean** — presentation, writeup, product strategy