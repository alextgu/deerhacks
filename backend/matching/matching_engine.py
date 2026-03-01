"""
matching_engine.py
==================
Snowflake-backed matching engine for Mirror.
Two-phase search: fast vector filtering in SQL, rich re-ranking in Python.

Phase 1 (SQL):  VECTOR_COSINE_SIMILARITY with server scoping + flag filtering
Phase 2 (Python): compute_match() re-ranking with clash/bonus rules
"""

import os
import json
import logging
from dataclasses import dataclass
from typing import Optional

import snowflake.connector

from matching import compute_match, result_to_dict, VARIABLE_CONFIG
from features import red_flag_radar, gemini_blurb, group_match

logger = logging.getLogger(__name__)

DIMENSION_ORDER: list[str] = list(VARIABLE_CONFIG.keys())
assert len(DIMENSION_ORDER) == 50

# ── Snowflake Connection ────────────────────────────────────────────────────

def _get_connection() -> snowflake.connector.SnowflakeConnection:
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "MIRROR_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", "MIRROR"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "MATCHING"),
        role=os.environ.get("SNOWFLAKE_ROLE", "MIRROR_APP_ROLE"),
    )


# ── Vector Conversion ──────────────────────────────────────────────────────

def scores_to_vector(scores: dict[str, float]) -> list[float]:
    """Named scores dict -> ordered float array for the VECTOR column."""
    return [float(scores.get(dim, 0.5)) for dim in DIMENSION_ORDER]


def vector_to_scores(vector: list[float]) -> dict[str, float]:
    """Ordered float array -> named scores dict."""
    return {dim: vector[i] for i, dim in enumerate(DIMENSION_ORDER)}


def _reconstruct_vector_dict(scores_json: dict, evidence_json: dict | None) -> dict:
    return {
        "scores": scores_json,
        "evidence": evidence_json or {},
    }


# ── Raw Corpus + Cortex Embedding  ────────────────────────────────────────

def upsert_raw_corpus(user_id: str, cleaned_corpus: str) -> None:
    """Write the cleaned Takeout corpus into raw_user_onboarding for Cortex embedding."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            MERGE INTO RAW_USER_ONBOARDING tgt
            USING (SELECT %(user_id)s AS auth0_id, %(corpus)s AS cleaned_corpus) src
            ON tgt.auth0_id = src.auth0_id
            WHEN MATCHED THEN UPDATE SET
                cleaned_corpus = src.cleaned_corpus,
                updated_at     = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT (auth0_id, cleaned_corpus)
                VALUES (src.auth0_id, src.cleaned_corpus)
            """,
            {"user_id": user_id, "corpus": cleaned_corpus},
        )
        conn.commit()
    finally:
        conn.close()


def embed_and_upsert_archetype(user_id: str, server_id: str = "general") -> None:
    """
    Generate a 768-dim embedding from the user's cleaned_corpus in raw_user_onboarding
    via SNOWFLAKE.CORTEX.EMBED_TEXT_768, then insert/update user_archetypes.
    """
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            MERGE INTO USER_ARCHETYPES tgt
            USING (
                SELECT
                    auth0_id,
                    %(server_id)s AS server_id,
                    SNOWFLAKE.CORTEX.EMBED_TEXT_768(
                        'snowflake-arctic-embed-m',
                        cleaned_corpus
                    ) AS embedding,
                    'Analyzed Persona' AS archetype_label
                FROM RAW_USER_ONBOARDING
                WHERE auth0_id = %(user_id)s
            ) src
            ON tgt.user_id = src.auth0_id AND tgt.server_id = src.server_id
            WHEN MATCHED THEN UPDATE SET
                archetype_vector = src.embedding,
                updated_at       = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT (
                user_id, server_id, archetype_vector
            ) VALUES (
                src.auth0_id, src.server_id, src.embedding
            )
            """,
            {"user_id": user_id, "server_id": server_id},
        )
        conn.commit()
    finally:
        conn.close()


# ── Upsert User Archetype (Legacy 50-dim) ────────────────────────────────

def upsert_archetype(
    user_id: str,
    server_id: str,
    vector_dict: dict,
    reputation_score: float = 0.0,
) -> None:
    """Write or update a user's archetype vector in Snowflake."""
    scores = vector_dict["scores"]
    evidence = vector_dict.get("evidence", {})
    ordered_vector = scores_to_vector(scores)

    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            MERGE INTO USER_ARCHETYPES tgt
            USING (SELECT
                %(user_id)s                    AS user_id,
                %(server_id)s                  AS server_id,
                PARSE_JSON(%(vector)s)::VECTOR(FLOAT, 50)  AS archetype_vector,
                PARSE_JSON(%(scores)s)         AS scores_json,
                PARSE_JSON(%(evidence)s)       AS evidence_json,
                %(reputation)s                 AS reputation_score,
                %(confidence)s                 AS confidence,
                %(msg_count)s                  AS message_count_used
            ) src
            ON tgt.user_id = src.user_id AND tgt.server_id = src.server_id
            WHEN MATCHED THEN UPDATE SET
                archetype_vector   = src.archetype_vector,
                scores_json        = src.scores_json,
                evidence_json      = src.evidence_json,
                reputation_score   = src.reputation_score,
                confidence         = src.confidence,
                message_count_used = src.message_count_used,
                updated_at         = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT (
                user_id, server_id, archetype_vector, scores_json,
                evidence_json, reputation_score, confidence, message_count_used
            ) VALUES (
                src.user_id, src.server_id, src.archetype_vector, src.scores_json,
                src.evidence_json, src.reputation_score, src.confidence,
                src.message_count_used
            )
            """,
            {
                "user_id": user_id,
                "server_id": server_id,
                "vector": json.dumps(ordered_vector),
                "scores": json.dumps(scores),
                "evidence": json.dumps(evidence),
                "reputation": reputation_score,
                "confidence": vector_dict.get("confidence", "unknown"),
                "msg_count": vector_dict.get("message_count_used", 0),
            },
        )
        conn.commit()
    finally:
        conn.close()


# ── Phase 1a: Cortex Search (768-dim, unified with frontend) ─────────────────

CORTEX_SERVICE = os.environ.get("CORTEX_SEARCH_SERVICE_NAME", "ARCHETYPE_MATCH_SERVICE")
CORTEX_VECTOR_INDEX = os.environ.get("CORTEX_SEARCH_VECTOR_INDEX", "archetype_vector")
VECTOR_DIM_768 = 768


def get_user_embedding_768(auth0_id: str, server_id: str = "general") -> list[float] | None:
    """Fetch the user's 768-dim embedding from Snowflake (unified user_archetypes table)."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT archetype_vector::ARRAY AS emb
            FROM user_archetypes
            WHERE user_id = %(auth0_id)s AND server_id = %(server_id)s
            LIMIT 1
            """,
            {"auth0_id": auth0_id, "server_id": server_id},
        )
        row = cur.fetchone()
        if not row:
            return None
        raw = row[0]
        if not raw or len(raw) != VECTOR_DIM_768:
            return None
        return [float(x) for x in raw]
    finally:
        conn.close()


def _fetch_candidates_cortex(
    user_vector_768: list[float],
    server_id: str,
    exclude_auth0_id: str,
    limit: int = 20,
) -> list[dict]:
    """
    Phase 1 via Snowflake Cortex Search (same as frontend).
    Returns list of {"auth0_id": str, "score": float} for matching.
    """
    query_payload = {
        "multi_index_query": {
            CORTEX_VECTOR_INDEX: [{"vector": user_vector_768}],
        },
        "filter": {
            "@and": [
                {"@eq": {"server_id": server_id}},
                {"@eq": {"is_flagged": False}},
            ],
        },
        "columns": ["user_id"],
        "limit": limit,
    }
    query_json = json.dumps(query_payload)

    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT PARSE_JSON(SNOWFLAKE.CORTEX.SEARCH_PREVIEW(%s, %s))['results'] AS results
            """,
            (CORTEX_SERVICE, query_json),
        )
        row = cur.fetchone()
        raw = row[0] if row else None
        if not raw or not isinstance(raw, (list, str)):
            return []
        if isinstance(raw, str):
            raw = json.loads(raw)
        results = []
        for r in raw:
            aid = r.get("user_id") or r.get("USER_ID") or r.get("auth0_id") or r.get("AUTH0_ID")
            if not aid or aid == exclude_auth0_id:
                continue
            score = float(r.get("score", r.get("SCORE", 0.0)))
            results.append({"auth0_id": aid, "score": score})
        return results[:limit]
    finally:
        conn.close()


# ── Phase 1b: Legacy 50-dim Vector Candidate Retrieval ──────────────────────

def _fetch_candidates(
    user_vector: list[float],
    server_id: str,
    user_id: str,
    limit: int = 20,
) -> list[dict]:
    """
    Legacy SQL phase: VECTOR_COSINE_SIMILARITY on 50-dim USER_ARCHETYPES,
    server-scoped, flagged users excluded. Use Cortex path when 768-dim available.
    """
    conn = _get_connection()
    try:
        cur = conn.cursor(snowflake.connector.DictCursor)
        cur.execute(
            """
            SELECT
                ua.user_id,
                VECTOR_COSINE_SIMILARITY(
                    ua.archetype_vector,
                    PARSE_JSON(%(query_vec)s)::VECTOR(FLOAT, 50)
                ) AS cosine_score,
                ua.scores_json,
                ua.evidence_json,
                ua.reputation_score
            FROM USER_ARCHETYPES ua
            WHERE ua.server_id = %(server_id)s
              AND ua.user_id != %(user_id)s
              AND ua.status = 'active'
              AND ua.abandonment_count < 3
            ORDER BY cosine_score DESC
            LIMIT %(lim)s
            """,
            {
                "query_vec": json.dumps(user_vector),
                "server_id": server_id,
                "user_id": user_id,
                "lim": limit,
            },
        )
        return cur.fetchall()
    finally:
        conn.close()


# ── Phase 2: Python Re-ranking ──────────────────────────────────────────────

@dataclass
class MatchCandidate:
    user_id: str
    cosine_score: float
    weighted_score: float
    grade: str
    dimension_scores: dict
    top_strengths: list
    top_tensions: list
    clash_penalties: list
    bonuses: list
    red_flags: dict | None
    reputation_score: float


def _parse_variant(val) -> dict:
    """Snowflake VARIANT comes back as str or dict depending on driver version."""
    if isinstance(val, str):
        return json.loads(val)
    return val if val is not None else {}


def _rerank_candidates(
    query_vector_dict: dict,
    candidates: list[dict],
    context: str,
    include_red_flags: bool = True,
) -> list[MatchCandidate]:
    """
    Run compute_match() on each candidate — full weighted scoring
    with clash/bonus rules, optional red flag analysis.
    """
    results = []
    for cand in candidates:
        cand_scores = _parse_variant(cand["SCORES_JSON"])
        cand_evidence = _parse_variant(cand.get("EVIDENCE_JSON"))
        cand_vector_dict = _reconstruct_vector_dict(cand_scores, cand_evidence)

        match_result = compute_match(query_vector_dict, cand_vector_dict, context)
        match_data = result_to_dict(match_result)

        red_flags = None
        if include_red_flags:
            red_flags = red_flag_radar(query_vector_dict, cand_vector_dict, context)

        results.append(MatchCandidate(
            user_id=cand["USER_ID"],
            cosine_score=float(cand["COSINE_SCORE"]),
            weighted_score=match_data["score"],
            grade=match_data["grade"],
            dimension_scores=match_data["dimension_scores"],
            top_strengths=match_data["top_strengths"],
            top_tensions=match_data["top_tensions"],
            clash_penalties=match_data["clash_penalties"],
            bonuses=match_data["bonuses"],
            red_flags=red_flags,
            reputation_score=float(cand.get("REPUTATION_SCORE", 0)),
        ))

    results.sort(key=lambda m: m.weighted_score, reverse=True)
    return results


# ── Red Flag Radar: Dangerous Delta Detection ──────────────────────────────

DANGEROUS_DIMENSIONS = {
    "emotional_expressiveness": 0.50,
    "hotheadedness":            0.40,
    "vulnerability":            0.45,
    "feedback_receptivity":     0.45,
    "directness":               0.55,
    "life_pace":                0.55,
    "structure_need":           0.50,
    "leadership_drive":         0.45,
    "emotional_neediness":      0.40,
    "long_term_thinking":       0.50,
    "independence_value":       0.50,
}


def _detect_dangerous_deltas(
    query_scores: dict, candidate_scores: dict, cosine_score: float
) -> list[dict]:
    """
    Fires when cosine_score >= 0.7 (match looks good on paper) but
    critical dimensions have a dangerous gap hidden underneath.
    """
    if cosine_score < 0.7:
        return []

    alerts = []
    for dim, threshold in DANGEROUS_DIMENSIONS.items():
        a_val = query_scores.get(dim, 0.5)
        b_val = candidate_scores.get(dim, 0.5)
        delta = abs(a_val - b_val)
        if delta >= threshold:
            alerts.append({
                "dimension": dim,
                "your_value": round(a_val, 3),
                "their_value": round(b_val, 3),
                "delta": round(delta, 3),
                "warning": (
                    f"High overall compatibility masks a significant gap in "
                    f"{dim.replace('_', ' ')} (delta: {delta:.2f}). "
                    f"This could surface under stress."
                ),
            })
    return alerts


# ── Main API: get_matches() ─────────────────────────────────────────────────

def get_matches(
    user_id: str,
    user_vector: dict,
    context: str,
    server_id: str,
    top_n: int = 10,
    include_blurbs: bool = False,
    api_key: Optional[str] = None,
) -> dict:
    """
    Full matching pipeline.

    Phase 1 (SQL):    VECTOR_COSINE_SIMILARITY scan, server-scoped, flag-filtered
    Phase 2 (Python): compute_match() re-rank with clash/bonus rules
    Phase 3:          Dangerous delta annotation + optional Gemini blurbs

    Returns a JSON-serializable dict ready for the frontend.
    """
    assert context in ("hackathon", "romantic", "friendship")

    ordered_vector = scores_to_vector(user_vector["scores"])

    # Phase 1: Snowflake vector search — fetch 2x for re-ranking headroom
    candidates = _fetch_candidates(
        user_vector=ordered_vector,
        server_id=server_id,
        user_id=user_id,
        limit=top_n * 2,
    )

    if not candidates:
        return {
            "user_id": user_id,
            "context": context,
            "server_id": server_id,
            "matches": [],
            "candidate_pool_size": 0,
        }

    # Phase 2: Python re-ranking with full weighted scoring
    ranked = _rerank_candidates(
        query_vector_dict=user_vector,
        candidates=candidates,
        context=context,
        include_red_flags=True,
    )

    final_matches = ranked[:top_n]

    # Phase 3: Annotate with dangerous deltas + optional blurbs
    output = []
    for match in final_matches:
        cand_row = next(c for c in candidates if c["USER_ID"] == match.user_id)
        cand_scores = _parse_variant(cand_row["SCORES_JSON"])

        dangerous = _detect_dangerous_deltas(
            user_vector["scores"], cand_scores, match.cosine_score
        )

        blurb = None
        if include_blurbs and api_key:
            try:
                cand_evidence = _parse_variant(cand_row.get("EVIDENCE_JSON"))
                cand_dict = _reconstruct_vector_dict(cand_scores, cand_evidence)
                blurb = gemini_blurb(
                    user_vector, cand_dict, context, api_key=api_key
                )
            except Exception as e:
                logger.warning("Blurb generation failed for %s: %s", match.user_id, e)

        output.append({
            "user_id": match.user_id,
            "cosine_score": round(match.cosine_score, 4),
            "weighted_score": match.weighted_score,
            "grade": match.grade,
            "dimension_scores": match.dimension_scores,
            "top_strengths": match.top_strengths,
            "top_tensions": match.top_tensions,
            "clash_penalties": match.clash_penalties,
            "bonuses": match.bonuses,
            "red_flags": match.red_flags,
            "dangerous_deltas": dangerous,
            "reputation_score": match.reputation_score,
            "blurb": blurb,
        })

    _record_match_history(user_id, output, server_id, context)

    return {
        "user_id": user_id,
        "context": context,
        "server_id": server_id,
        "matches": output,
        "candidate_pool_size": len(candidates),
    }


def get_matches_cortex(
    auth0_id: str,
    server_id: str,
    context: str,
    top_n: int = 10,
    include_blurbs: bool = False,
    api_key: Optional[str] = None,
) -> dict:
    """
    Matching pipeline using Snowflake Cortex Search only (same vector comparison
    as the frontend). No 50-dim data or Python re-rank; vector comparison is
    entirely in Snowflake.
    """
    assert context in ("hackathon", "romantic", "friendship")

    embedding = get_user_embedding_768(auth0_id, server_id)
    if not embedding:
        return {
            "user_id": auth0_id,
            "context": context,
            "server_id": server_id,
            "matches": [],
            "candidate_pool_size": 0,
            "source": "cortex",
        }

    candidates = _fetch_candidates_cortex(
        user_vector_768=embedding,
        server_id=server_id,
        exclude_auth0_id=auth0_id,
        limit=top_n,
    )

    output = []
    for c in candidates:
        output.append({
            "user_id": c["auth0_id"],
            "cosine_score": round(c["score"], 4),
            "weighted_score": None,
            "grade": None,
            "dimension_scores": None,
            "top_strengths": None,
            "top_tensions": None,
            "clash_penalties": None,
            "bonuses": None,
            "red_flags": None,
            "dangerous_deltas": None,
            "reputation_score": None,
            "blurb": None,
        })

    return {
        "user_id": auth0_id,
        "context": context,
        "server_id": server_id,
        "matches": output,
        "candidate_pool_size": len(candidates),
        "source": "cortex",
    }


# ── Group Match (Snowflake-accelerated) ─────────────────────────────────────

def get_group_match(
    server_id: str,
    team_size: int = 4,
) -> dict:
    """
    Find optimal hackathon teams from all active users in a server.
    Pulls vectors from Snowflake, then uses the Python group_match()
    for full weighted scoring with role coverage.
    """
    conn = _get_connection()
    try:
        cur = conn.cursor(snowflake.connector.DictCursor)
        cur.execute(
            """
            SELECT user_id, scores_json, evidence_json
            FROM USER_ARCHETYPES
            WHERE server_id = %(sid)s
              AND status = 'active'
              AND abandonment_count < 3
            ORDER BY reputation_score DESC
            """,
            {"sid": server_id},
        )
        rows = cur.fetchall()

        if len(rows) < team_size:
            return {"error": f"Need at least {team_size} active users, found {len(rows)}"}

        vectors = []
        names = []
        for row in rows:
            scores = _parse_variant(row["SCORES_JSON"])
            vectors.append({"scores": scores, "evidence": {}})
            names.append(row["USER_ID"])

        return group_match(vectors, names, team_size)
    finally:
        conn.close()


# ── Match History Recording ─────────────────────────────────────────────────

def _record_match_history(
    user_id: str,
    matches: list[dict],
    server_id: str,
    context: str,
) -> None:
    """Batch-insert match results into MATCH_HISTORY for analytics."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        for m in matches:
            cur.execute(
                """
                INSERT INTO MATCH_HISTORY (
                    user_a_id, user_b_id, server_id, context,
                    cosine_score, weighted_score, grade,
                    red_flags_json, blurb_json
                ) VALUES (
                    %(a)s, %(b)s, %(sid)s, %(ctx)s,
                    %(cos)s, %(ws)s, %(g)s,
                    PARSE_JSON(%(rf)s), PARSE_JSON(%(bl)s)
                )
                """,
                {
                    "a": user_id,
                    "b": m["user_id"],
                    "sid": server_id,
                    "ctx": context,
                    "cos": m["cosine_score"],
                    "ws": m["weighted_score"],
                    "g": m["grade"],
                    "rf": json.dumps(m.get("red_flags")),
                    "bl": json.dumps(m.get("blurb")),
                },
            )
        conn.commit()
    except Exception as e:
        logger.error("Failed to record match history: %s", e)
    finally:
        conn.close()


# ── Abandonment Tracking ────────────────────────────────────────────────────

def increment_abandonment(user_id: str, server_id: str) -> None:
    """Increment abandonment counter. Auto-flags user at threshold (>= 3)."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE USER_ARCHETYPES
            SET abandonment_count = abandonment_count + 1,
                status = CASE
                    WHEN abandonment_count + 1 >= 3 THEN 'flagged'
                    ELSE status
                END,
                updated_at = CURRENT_TIMESTAMP()
            WHERE user_id = %(uid)s AND server_id = %(sid)s
            """,
            {"uid": user_id, "sid": server_id},
        )
        conn.commit()
    finally:
        conn.close()
