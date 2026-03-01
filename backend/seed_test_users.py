"""
Seed script: insert test users into Supabase + Snowflake.
Run from backend/: python seed_test_users.py

Creates 5 test users so the matching flow has data to work with.
"""

import os
import json
import random
import requests
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env.local"))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

TEST_USERS = [
    {
        "id": "test|user-alex-001",
        "email": "alex.chen@example.com",
        "first_name": "Alex",
        "last_name": "Chen",
        "summary": "Full-stack developer passionate about AI/ML and open-source. Loves hackathons and building prototypes fast.",
        "archetype_json": {"type": "builder", "strengths": ["systems_thinking", "tech_curiosity", "abstract_thinking"]},
        "scores": {
            "abstract_thinking": 0.85, "systems_thinking": 0.9, "pattern_recognition": 0.8,
            "creative_expression": 0.6, "emotional_depth": 0.45, "social_orientation": 0.55,
            "risk_tolerance": 0.75, "intellectual_curiosity": 0.95, "practical_focus": 0.7,
            "aesthetic_sensitivity": 0.4, "verbal_fluency": 0.65, "analytical_rigor": 0.88,
            "empathy": 0.5, "leadership": 0.6, "adaptability": 0.8,
            "persistence": 0.85, "humor": 0.7, "independence": 0.9,
            "collaboration": 0.55, "optimism": 0.65, "self_awareness": 0.6,
            "ambition": 0.8, "mindfulness": 0.35, "tech_curiosity": 0.95,
            "nature_affinity": 0.3, "competitiveness": 0.7, "nurturing": 0.35,
            "spontaneity": 0.6, "tradition": 0.25, "novelty_seeking": 0.85,
            "structure": 0.7, "introversion": 0.65, "sensory_seeking": 0.4,
            "philosophical": 0.7, "pragmatism": 0.75, "cultural_openness": 0.8,
            "materialism": 0.3, "spirituality": 0.2, "health_consciousness": 0.5,
            "financial_focus": 0.55, "environmental_concern": 0.6, "political_engagement": 0.35,
            "family_orientation": 0.4, "career_drive": 0.85, "social_justice": 0.5,
            "artistic_expression": 0.4, "scientific_thinking": 0.9, "communication_style": 0.6,
            "conflict_resolution": 0.5, "physical_lifestyle": 0.45,
        },
    },
    {
        "id": "test|user-maya-002",
        "email": "maya.patel@example.com",
        "first_name": "Maya",
        "last_name": "Patel",
        "summary": "UX designer and creative thinker. Interested in human-centered AI and the intersection of art and technology.",
        "archetype_json": {"type": "designer", "strengths": ["creative_expression", "empathy", "aesthetic_sensitivity"]},
        "scores": {
            "abstract_thinking": 0.7, "systems_thinking": 0.6, "pattern_recognition": 0.75,
            "creative_expression": 0.95, "emotional_depth": 0.85, "social_orientation": 0.8,
            "risk_tolerance": 0.5, "intellectual_curiosity": 0.8, "practical_focus": 0.55,
            "aesthetic_sensitivity": 0.95, "verbal_fluency": 0.85, "analytical_rigor": 0.5,
            "empathy": 0.9, "leadership": 0.55, "adaptability": 0.85,
            "persistence": 0.6, "humor": 0.8, "independence": 0.6,
            "collaboration": 0.85, "optimism": 0.8, "self_awareness": 0.85,
            "ambition": 0.6, "mindfulness": 0.8, "tech_curiosity": 0.65,
            "nature_affinity": 0.75, "competitiveness": 0.3, "nurturing": 0.85,
            "spontaneity": 0.8, "tradition": 0.4, "novelty_seeking": 0.9,
            "structure": 0.35, "introversion": 0.45, "sensory_seeking": 0.8,
            "philosophical": 0.65, "pragmatism": 0.45, "cultural_openness": 0.95,
            "materialism": 0.25, "spirituality": 0.6, "health_consciousness": 0.7,
            "financial_focus": 0.35, "environmental_concern": 0.85, "political_engagement": 0.5,
            "family_orientation": 0.65, "career_drive": 0.6, "social_justice": 0.8,
            "artistic_expression": 0.95, "scientific_thinking": 0.5, "communication_style": 0.85,
            "conflict_resolution": 0.75, "physical_lifestyle": 0.6,
        },
    },
    {
        "id": "test|user-jordan-003",
        "email": "jordan.kim@example.com",
        "first_name": "Jordan",
        "last_name": "Kim",
        "summary": "Data scientist and ML engineer. Focused on NLP and recommendation systems. Looking for co-founders.",
        "archetype_json": {"type": "analyst", "strengths": ["analytical_rigor", "pattern_recognition", "scientific_thinking"]},
        "scores": {
            "abstract_thinking": 0.9, "systems_thinking": 0.85, "pattern_recognition": 0.95,
            "creative_expression": 0.4, "emotional_depth": 0.5, "social_orientation": 0.4,
            "risk_tolerance": 0.6, "intellectual_curiosity": 0.9, "practical_focus": 0.8,
            "aesthetic_sensitivity": 0.3, "verbal_fluency": 0.55, "analytical_rigor": 0.95,
            "empathy": 0.45, "leadership": 0.5, "adaptability": 0.65,
            "persistence": 0.9, "humor": 0.5, "independence": 0.85,
            "collaboration": 0.5, "optimism": 0.55, "self_awareness": 0.55,
            "ambition": 0.85, "mindfulness": 0.3, "tech_curiosity": 0.9,
            "nature_affinity": 0.25, "competitiveness": 0.75, "nurturing": 0.3,
            "spontaneity": 0.35, "tradition": 0.4, "novelty_seeking": 0.7,
            "structure": 0.85, "introversion": 0.8, "sensory_seeking": 0.3,
            "philosophical": 0.75, "pragmatism": 0.85, "cultural_openness": 0.6,
            "materialism": 0.45, "spirituality": 0.15, "health_consciousness": 0.55,
            "financial_focus": 0.7, "environmental_concern": 0.4, "political_engagement": 0.3,
            "family_orientation": 0.35, "career_drive": 0.9, "social_justice": 0.4,
            "artistic_expression": 0.25, "scientific_thinking": 0.95, "communication_style": 0.5,
            "conflict_resolution": 0.45, "physical_lifestyle": 0.4,
        },
    },
    {
        "id": "test|user-sam-004",
        "email": "sam.torres@example.com",
        "first_name": "Sam",
        "last_name": "Torres",
        "summary": "Community organizer and social entrepreneur. Building tools for civic engagement and mutual aid.",
        "archetype_json": {"type": "connector", "strengths": ["social_orientation", "leadership", "empathy"]},
        "scores": {
            "abstract_thinking": 0.55, "systems_thinking": 0.65, "pattern_recognition": 0.6,
            "creative_expression": 0.7, "emotional_depth": 0.8, "social_orientation": 0.95,
            "risk_tolerance": 0.7, "intellectual_curiosity": 0.7, "practical_focus": 0.75,
            "aesthetic_sensitivity": 0.5, "verbal_fluency": 0.9, "analytical_rigor": 0.5,
            "empathy": 0.95, "leadership": 0.85, "adaptability": 0.8,
            "persistence": 0.75, "humor": 0.85, "independence": 0.5,
            "collaboration": 0.95, "optimism": 0.9, "self_awareness": 0.75,
            "ambition": 0.7, "mindfulness": 0.65, "tech_curiosity": 0.5,
            "nature_affinity": 0.6, "competitiveness": 0.35, "nurturing": 0.9,
            "spontaneity": 0.75, "tradition": 0.5, "novelty_seeking": 0.65,
            "structure": 0.5, "introversion": 0.2, "sensory_seeking": 0.6,
            "philosophical": 0.6, "pragmatism": 0.7, "cultural_openness": 0.9,
            "materialism": 0.2, "spirituality": 0.55, "health_consciousness": 0.65,
            "financial_focus": 0.4, "environmental_concern": 0.85, "political_engagement": 0.9,
            "family_orientation": 0.75, "career_drive": 0.65, "social_justice": 0.95,
            "artistic_expression": 0.55, "scientific_thinking": 0.45, "communication_style": 0.9,
            "conflict_resolution": 0.85, "physical_lifestyle": 0.6,
        },
    },
    {
        "id": "test|user-river-005",
        "email": "river.nakamura@example.com",
        "first_name": "River",
        "last_name": "Nakamura",
        "summary": "Blockchain developer and crypto researcher. Exploring decentralized identity and zero-knowledge proofs.",
        "archetype_json": {"type": "hacker", "strengths": ["tech_curiosity", "independence", "risk_tolerance"]},
        "scores": {
            "abstract_thinking": 0.85, "systems_thinking": 0.8, "pattern_recognition": 0.85,
            "creative_expression": 0.5, "emotional_depth": 0.4, "social_orientation": 0.35,
            "risk_tolerance": 0.9, "intellectual_curiosity": 0.9, "practical_focus": 0.65,
            "aesthetic_sensitivity": 0.35, "verbal_fluency": 0.5, "analytical_rigor": 0.85,
            "empathy": 0.4, "leadership": 0.45, "adaptability": 0.75,
            "persistence": 0.85, "humor": 0.6, "independence": 0.95,
            "collaboration": 0.4, "optimism": 0.5, "self_awareness": 0.5,
            "ambition": 0.9, "mindfulness": 0.25, "tech_curiosity": 0.95,
            "nature_affinity": 0.2, "competitiveness": 0.8, "nurturing": 0.2,
            "spontaneity": 0.7, "tradition": 0.15, "novelty_seeking": 0.95,
            "structure": 0.6, "introversion": 0.85, "sensory_seeking": 0.45,
            "philosophical": 0.8, "pragmatism": 0.6, "cultural_openness": 0.7,
            "materialism": 0.5, "spirituality": 0.3, "health_consciousness": 0.4,
            "financial_focus": 0.75, "environmental_concern": 0.35, "political_engagement": 0.45,
            "family_orientation": 0.25, "career_drive": 0.85, "social_justice": 0.45,
            "artistic_expression": 0.3, "scientific_thinking": 0.85, "communication_style": 0.45,
            "conflict_resolution": 0.4, "physical_lifestyle": 0.35,
        },
    },
]

DIMENSION_ORDER = [
    "abstract_thinking", "systems_thinking", "pattern_recognition",
    "creative_expression", "emotional_depth", "social_orientation",
    "risk_tolerance", "intellectual_curiosity", "practical_focus",
    "aesthetic_sensitivity", "verbal_fluency", "analytical_rigor",
    "empathy", "leadership", "adaptability",
    "persistence", "humor", "independence",
    "collaboration", "optimism", "self_awareness",
    "ambition", "mindfulness", "tech_curiosity",
    "nature_affinity", "competitiveness", "nurturing",
    "spontaneity", "tradition", "novelty_seeking",
    "structure", "introversion", "sensory_seeking",
    "philosophical", "pragmatism", "cultural_openness",
    "materialism", "spirituality", "health_consciousness",
    "financial_focus", "environmental_concern", "political_engagement",
    "family_orientation", "career_drive", "social_justice",
    "artistic_expression", "scientific_thinking", "communication_style",
    "conflict_resolution", "physical_lifestyle",
]


def seed_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        return False

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    for u in TEST_USERS:
        row = {
            "id": u["id"],
            "email": u["email"],
            "first_name": u["first_name"],
            "last_name": u["last_name"],
            "summary": u["summary"],
            "archetype": u["archetype_json"].get("type", "unknown"),
            "archetype_scores": u["scores"],
        }
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=headers,
            json=row,
        )
        if resp.status_code in (200, 201):
            print(f"  Supabase ✓ {u['first_name']} {u['last_name']}")
        else:
            print(f"  Supabase ✗ {u['first_name']}: {resp.status_code} {resp.text[:200]}")

    return True


def seed_snowflake():
    try:
        conn = snowflake.connector.connect(
            account=os.environ["SNOWFLAKE_ACCOUNT"],
            user=os.environ["SNOWFLAKE_USER"],
            password=os.environ["SNOWFLAKE_PASSWORD"],
            warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "MIRROR_WH"),
            database=os.environ.get("SNOWFLAKE_DATABASE", "MIRROR"),
            schema=os.environ.get("SNOWFLAKE_SCHEMA", "MATCHING"),
            role=os.environ.get("SNOWFLAKE_ROLE", "MIRROR_APP_ROLE"),
        )
    except Exception as e:
        print(f"ERROR connecting to Snowflake: {e}")
        return False

    cur = conn.cursor()
    for u in TEST_USERS:
        vector = [float(u["scores"].get(dim, 0.5)) for dim in DIMENSION_ORDER]

        for server_id in ["general", "hackathon", "friend", "cofounder"]:
            try:
                cur.execute(
                    """
                    MERGE INTO USER_ARCHETYPES tgt
                    USING (SELECT
                        %(uid)s AS user_id,
                        %(sid)s AS server_id,
                        PARSE_JSON(%(vec)s)::VECTOR(FLOAT, 50) AS archetype_vector,
                        PARSE_JSON(%(scores)s) AS scores_json,
                        PARSE_JSON(%(evidence)s) AS evidence_json,
                        0.0 AS reputation_score,
                        'high' AS confidence,
                        100 AS message_count_used
                    ) src
                    ON tgt.user_id = src.user_id AND tgt.server_id = src.server_id
                    WHEN MATCHED THEN UPDATE SET
                        archetype_vector = src.archetype_vector,
                        scores_json = src.scores_json,
                        updated_at = CURRENT_TIMESTAMP()
                    WHEN NOT MATCHED THEN INSERT (
                        user_id, server_id, archetype_vector, scores_json,
                        evidence_json, reputation_score, confidence, message_count_used
                    ) VALUES (
                        src.user_id, src.server_id, src.archetype_vector, src.scores_json,
                        src.evidence_json, src.reputation_score, src.confidence, src.message_count_used
                    )
                    """,
                    {
                        "uid": u["id"],
                        "sid": server_id,
                        "vec": json.dumps(vector),
                        "scores": json.dumps(u["scores"]),
                        "evidence": json.dumps({}),
                    },
                )
                conn.commit()
            except Exception as e:
                print(f"  Snowflake ✗ {u['first_name']} ({server_id}): {e}")
                continue

        print(f"  Snowflake ✓ {u['first_name']} {u['last_name']} (4 server_ids)")

    conn.close()
    return True


if __name__ == "__main__":
    print("=== Seeding Supabase profiles ===")
    seed_supabase()
    print()
    print("=== Seeding Snowflake USER_ARCHETYPES ===")
    seed_snowflake()
    print()
    print("Done! 5 test users ready for matching.")
