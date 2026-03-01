"""
main.py — DeerHacks Backend API
================================
FastAPI server exposing all matching/features as REST endpoints.

Setup:
    pip install fastapi uvicorn python-multipart python-dotenv
    cd deerhacks/backend
    uvicorn main:app --reload --port 8000

All endpoints return JSON.
Frontend base URL: http://localhost:8000
"""

import os
import sys
import json
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Add matching directory to path so we can import from it
sys.path.append(os.path.join(os.path.dirname(__file__), "matching"))

from features import (
    self_portrait,
    all_context_scores,
    gemini_blurb,
    blind_spot,
    red_flag_radar,
    how_well_do_you_know_me,
    growth_diff,
    group_match,
    relationship_type,
    opening_message,
)
from vector_extraction import run_pipeline
from matching import compute_match, result_to_dict
from matching_engine import (
    get_matches as snowflake_get_matches,
    get_group_match as snowflake_get_group_match,
    upsert_archetype,
    increment_abandonment,
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

app = FastAPI(title="DeerHacks Matching API", version="1.0.0")

# Allow Next.js frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── PYDANTIC MODELS ───────────────────────────────────────────────────────────

class VectorPayload(BaseModel):
    vector: Optional[dict] = None       # full vector JSON — OR pass scores/evidence directly
    scores: Optional[dict] = None       # accept flat format too
    evidence: Optional[dict] = None
    confidence: Optional[str] = None
    message_count_used: Optional[int] = None

    def get_vector(self) -> dict:
        """Accept either {vector: {...}} or the vector fields directly."""
        if self.vector:
            return self.vector
        if self.scores:
            return {
                "scores": self.scores,
                "evidence": self.evidence or {},
                "confidence": self.confidence or "unknown",
                "message_count_used": self.message_count_used or 0,
            }
        raise ValueError("Must provide either 'vector' or 'scores'")

class TwoVectorsPayload(BaseModel):
    vector_a: dict
    vector_b: dict
    context: Optional[str] = "hackathon"  # hackathon | romantic | friendship

class TwoVectorsNoContext(BaseModel):
    vector_a: dict
    vector_b: dict

class GrowthPayload(BaseModel):
    vector_past: dict
    vector_now: dict
    label_past: Optional[str] = "6 months ago"
    label_now: Optional[str] = "today"

class GroupPayload(BaseModel):
    vectors: list[dict]
    names: list[str]
    team_size: int = 4

class BlurbPayload(BaseModel):
    vector_a: dict
    vector_b: dict
    context: Optional[str] = "hackathon"
    name_a: Optional[str] = "Person A"
    name_b: Optional[str] = "Person B"

class OpeningPayload(BaseModel):
    vector_a: dict
    vector_b: dict
    context: Optional[str] = "hackathon"
    name_a: Optional[str] = "me"
    name_b: Optional[str] = "them"

class QuizPayload(BaseModel):
    vector: dict
    name: Optional[str] = "them"


class SnowflakeMatchPayload(BaseModel):
    user_id: str
    vector: dict
    context: str = "hackathon"
    server_id: str = "hackathon"
    top_n: int = 10
    include_blurbs: bool = False

class SnowflakeGroupPayload(BaseModel):
    server_id: str
    team_size: int = 4

class ArchetypePayload(BaseModel):
    user_id: str
    server_id: str
    vector: dict
    reputation_score: float = 0.0

class AbandonPayload(BaseModel):
    user_id: str
    server_id: str


# ── HEALTH CHECK ──────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "message": "DeerHacks Matching API is running"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "gemini_key_loaded": bool(GEMINI_API_KEY),
    }


# ── 1. EXTRACT VECTOR FROM GOOGLE TAKEOUT ────────────────────────────────────

@app.post("/extract")
async def extract_vector(file: UploadFile = File(...)):
    """
    Upload a Google Takeout Gemini JSON file.
    Returns the 50-variable personality vector.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server")

    # Save upload to temp file
    tmp_path = f"/tmp/{file.filename}"
    out_path  = f"/tmp/{file.filename}_vector.json"

    contents = await file.read()
    with open(tmp_path, "wb") as f:
        f.write(contents)

    try:
        result = run_pipeline(
            input_path=tmp_path,
            api_key=GEMINI_API_KEY,
            output_path=out_path
        )
        return {"success": True, "vector": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)
        if os.path.exists(out_path): os.remove(out_path)


# ── 2. SELF PORTRAIT ──────────────────────────────────────────────────────────

@app.post("/portrait")
def get_self_portrait(payload: VectorPayload):
    """
    Returns all data needed for the self-portrait spider chart.
    dimension_scores → radar axes
    top5/bottom5 → highlight cards
    """
    try:
        return self_portrait(payload.get_vector())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 3. ALL CONTEXT SCORES ─────────────────────────────────────────────────────

@app.post("/match/all-contexts")
def get_all_context_scores(payload: TwoVectorsNoContext):
    """
    Score two people across all three contexts simultaneously.
    Returns hackathon, romantic, friendship scores + best_context + summary line.
    This powers the unified match card.
    """
    try:
        return all_context_scores(payload.vector_a, payload.vector_b)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 4. SINGLE CONTEXT MATCH ───────────────────────────────────────────────────

@app.post("/match")
def get_match(payload: TwoVectorsPayload):
    """
    Score two people for a specific context.
    Returns score, grade, dimension_scores, top_strengths, top_tensions.
    """
    if payload.context not in ("hackathon", "romantic", "friendship"):
        raise HTTPException(status_code=400, detail="context must be hackathon | romantic | friendship")
    try:
        result = compute_match(payload.vector_a, payload.vector_b, payload.context)
        return result_to_dict(result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 5. GEMINI BLURB ───────────────────────────────────────────────────────────

@app.post("/match/blurb")
def get_blurb(payload: BlurbPayload):
    """
    Generate a personalized "why you two should connect" blurb via Gemini.
    Returns hook, blurb, shared_traits, complementary.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server")
    try:
        return gemini_blurb(
            payload.vector_a, payload.vector_b,
            payload.context, payload.name_a, payload.name_b,
            api_key=GEMINI_API_KEY
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 6. BLIND SPOT ─────────────────────────────────────────────────────────────

@app.post("/portrait/blind-spot")
def get_blind_spot(payload: VectorPayload):
    """
    Returns hidden strengths and honest growth edges.
    The most impactful feature — show this prominently in the UI.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server")
    try:
        return blind_spot(payload.get_vector(), api_key=GEMINI_API_KEY)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 7. RED FLAG RADAR ─────────────────────────────────────────────────────────

@app.post("/match/red-flags")
def get_red_flags(payload: TwoVectorsPayload):
    """
    Private friction warnings for the requesting user only.
    Never shown to the other person.
    """
    if payload.context not in ("hackathon", "romantic", "friendship"):
        raise HTTPException(status_code=400, detail="context must be hackathon | romantic | friendship")
    try:
        return red_flag_radar(payload.vector_a, payload.vector_b, payload.context)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 8. HOW WELL DO YOU KNOW ME ────────────────────────────────────────────────

@app.post("/quiz/generate")
def get_quiz(payload: QuizPayload):
    """
    Generate an 8-question quiz for a friend to guess your personality scores.
    Shareable, social, Spotify-Wrapped style.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server")
    try:
        return how_well_do_you_know_me(payload.get_vector(), payload.name, api_key=GEMINI_API_KEY)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 9. GROWTH DIFF ────────────────────────────────────────────────────────────

@app.post("/portrait/growth")
def get_growth(payload: GrowthPayload):
    """
    Compare two snapshots of the same person over time.
    Returns dimension deltas, biggest growth, biggest regression, narrative.
    """
    try:
        return growth_diff(
            payload.vector_past, payload.vector_now,
            payload.label_past, payload.label_now
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 10. GROUP MATCH ───────────────────────────────────────────────────────────

@app.post("/match/group")
def get_group_match(payload: GroupPayload):
    """
    Find the optimal 4-person hackathon team from a pool of people.
    Returns optimal_team, pairwise_scores, coverage_gaps, runner_ups.
    """
    if len(payload.vectors) < payload.team_size:
        raise HTTPException(status_code=400, detail=f"Need at least {payload.team_size} people in the pool")
    if len(payload.vectors) != len(payload.names):
        raise HTTPException(status_code=400, detail="vectors and names must be same length")
    try:
        return group_match(payload.vectors, payload.names, payload.team_size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 11. RELATIONSHIP TYPE ─────────────────────────────────────────────────────

@app.post("/match/relationship-type")
def get_relationship_type(payload: TwoVectorsNoContext):
    """
    Predict the natural dynamic between two people.
    Returns type label, description, dynamic_tags, long_term_outlook.
    """
    try:
        return relationship_type(payload.vector_a, payload.vector_b)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 12. OPENING MESSAGE ───────────────────────────────────────────────────────

@app.post("/match/opening-message")
def get_opening_message(payload: OpeningPayload):
    """
    Gemini drafts a personalized opening message from A to B.
    Calibrated to both personalities. Never cringe.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server")
    try:
        return opening_message(
            payload.vector_a, payload.vector_b,
            payload.context, payload.name_a, payload.name_b,
            api_key=GEMINI_API_KEY
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# V2: SNOWFLAKE-BACKED ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/v2/archetype")
def store_archetype(payload: ArchetypePayload):
    """Store or update a user's archetype vector in Snowflake."""
    try:
        upsert_archetype(
            payload.user_id, payload.server_id,
            payload.vector, payload.reputation_score,
        )
        return {"status": "ok", "user_id": payload.user_id, "server_id": payload.server_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v2/match")
def get_snowflake_matches(payload: SnowflakeMatchPayload):
    """
    Production matching: Snowflake vector search -> Python re-rank -> optional Gemini blurbs.
    """
    if payload.context not in ("hackathon", "romantic", "friendship"):
        raise HTTPException(status_code=400, detail="context must be hackathon | romantic | friendship")
    try:
        return snowflake_get_matches(
            user_id=payload.user_id,
            user_vector=payload.vector,
            context=payload.context,
            server_id=payload.server_id,
            top_n=payload.top_n,
            include_blurbs=payload.include_blurbs,
            api_key=GEMINI_API_KEY,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v2/match/group")
def get_snowflake_group(payload: SnowflakeGroupPayload):
    """Find optimal hackathon team from all active users in a server."""
    try:
        return snowflake_get_group_match(payload.server_id, payload.team_size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v2/abandon")
def report_abandonment(payload: AbandonPayload):
    """Increment abandonment counter for a user. Auto-flags at >= 3."""
    try:
        increment_abandonment(payload.user_id, payload.server_id)
        return {"status": "ok", "user_id": payload.user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))