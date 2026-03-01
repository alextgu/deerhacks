"""
Demo setup: verify cosine similarities, fix Saket's name, seed both demo vectors.
Run: python demo/setup_demo.py
"""

import os
import sys
import json
import math
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import snowflake.connector
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env.local"))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

DEMO_A_ID = "auth0|69a37834989a22983357f45c"     # Alex - alexwin2099
DEMO_B_ID = "auth0|69a3b447d5da837a86ede8de"       # Saket

DIMS = [
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


def load_scores(path):
    with open(path) as f:
        data = json.load(f)
    return data["scores"]


def to_vector(scores):
    return [float(scores.get(d, 0.5)) for d in DIMS]


def cosine_sim(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    ma = math.sqrt(sum(x * x for x in a))
    mb = math.sqrt(sum(x * x for x in b))
    return dot / (ma * mb) if ma and mb else 0


def fix_saket_name():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{DEMO_B_ID.replace('|', '%7C')}",
        headers=headers,
        json={"first_name": "Saket", "last_name": "Sharma"},
    )
    print(f"  Fix Saket name: {resp.status_code}")


def seed_vector(conn, user_id, scores):
    vec = to_vector(scores)
    cur = conn.cursor()
    for sid in ["general", "hackathon", "friend", "cofounder"]:
        cur.execute(
            """
            MERGE INTO USER_ARCHETYPES tgt
            USING (SELECT
                %(uid)s AS user_id,
                %(sid)s AS server_id,
                PARSE_JSON(%(vec)s)::VECTOR(FLOAT, 50) AS archetype_vector,
                PARSE_JSON(%(scores)s) AS scores_json,
                PARSE_JSON('{}') AS evidence_json,
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
                "uid": user_id,
                "sid": sid,
                "vec": json.dumps(vec),
                "scores": json.dumps(scores),
            },
        )
        conn.commit()


def main():
    demo_dir = os.path.dirname(__file__)
    alex_scores = load_scores(os.path.join(demo_dir, "alex_gemini_export.json"))
    saket_scores = load_scores(os.path.join(demo_dir, "saket_gemini_export.json"))

    alex_vec = to_vector(alex_scores)
    saket_vec = to_vector(saket_scores)

    print("=== Cosine Similarities ===")
    print(f"  Alex ↔ Saket:  {cosine_sim(alex_vec, saket_vec):.4f}")

    # Load test user scores from seed script to compare
    test_vecs = {
        "Alex Chen":    [0.85,0.9,0.8,0.6,0.45,0.55,0.75,0.95,0.7,0.4,0.65,0.88,0.5,0.6,0.8,0.85,0.7,0.9,0.55,0.65,0.6,0.8,0.35,0.95,0.3,0.7,0.35,0.6,0.25,0.85,0.7,0.65,0.4,0.7,0.75,0.8,0.3,0.2,0.5,0.55,0.6,0.35,0.4,0.85,0.5,0.4,0.9,0.6,0.5,0.45],
        "Maya Patel":   [0.7,0.6,0.75,0.95,0.85,0.8,0.5,0.8,0.55,0.95,0.85,0.5,0.9,0.55,0.85,0.6,0.8,0.6,0.85,0.8,0.85,0.6,0.8,0.65,0.75,0.3,0.85,0.8,0.4,0.9,0.35,0.45,0.8,0.65,0.45,0.95,0.25,0.6,0.7,0.35,0.85,0.5,0.65,0.6,0.8,0.95,0.5,0.85,0.75,0.6],
        "Jordan Kim":   [0.9,0.85,0.95,0.4,0.5,0.4,0.6,0.9,0.8,0.3,0.55,0.95,0.45,0.5,0.65,0.9,0.5,0.85,0.5,0.55,0.55,0.85,0.3,0.9,0.25,0.75,0.3,0.35,0.4,0.7,0.85,0.8,0.3,0.75,0.85,0.6,0.45,0.15,0.55,0.7,0.4,0.3,0.35,0.9,0.4,0.25,0.95,0.5,0.45,0.4],
        "Sam Torres":   [0.55,0.65,0.6,0.7,0.8,0.95,0.7,0.7,0.75,0.5,0.9,0.5,0.95,0.85,0.8,0.75,0.85,0.5,0.95,0.9,0.75,0.7,0.65,0.5,0.6,0.35,0.9,0.75,0.5,0.65,0.5,0.2,0.6,0.6,0.7,0.9,0.2,0.55,0.65,0.4,0.85,0.9,0.75,0.65,0.95,0.55,0.45,0.9,0.85,0.6],
        "River Nakamura":[0.85,0.8,0.85,0.5,0.4,0.35,0.9,0.9,0.65,0.35,0.5,0.85,0.4,0.45,0.75,0.85,0.6,0.95,0.4,0.5,0.5,0.9,0.25,0.95,0.2,0.8,0.2,0.7,0.15,0.95,0.6,0.85,0.45,0.8,0.6,0.7,0.5,0.3,0.4,0.75,0.35,0.45,0.25,0.85,0.45,0.3,0.85,0.45,0.4,0.35],
    }

    for name, tvec in test_vecs.items():
        sim_a = cosine_sim(alex_vec, tvec)
        sim_b = cosine_sim(saket_vec, tvec)
        print(f"  Alex ↔ {name:18s}: {sim_a:.4f}   Saket ↔ {name:18s}: {sim_b:.4f}")

    print()
    print("=== Fixing Saket's name ===")
    fix_saket_name()

    print()
    print("=== Seeding demo vectors to Snowflake ===")
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "MIRROR_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", "MIRROR"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "MATCHING"),
        role=os.environ.get("SNOWFLAKE_ROLE", "MIRROR_APP_ROLE"),
    )

    seed_vector(conn, DEMO_A_ID, alex_scores)
    print(f"  ✓ Alex  ({DEMO_A_ID})")

    seed_vector(conn, DEMO_B_ID, saket_scores)
    print(f"  ✓ Saket ({DEMO_B_ID})")

    conn.close()
    print()
    print("Done! Demo ready.")
    print()
    print("Demo flow:")
    print("  1. Alex logs in  → uploads demo/alex_gemini_export.json  → clicks 'Make My Chart'")
    print("  2. Saket logs in → uploads demo/saket_gemini_export.json → clicks 'Make My Chart'")
    print("  3. Either user clicks 'Find My Match' → they'll see each other as #1")
    print("  4. Test users (Maya, Jordan, Sam, River, Alex Chen) appear as lower-ranked matches")


if __name__ == "__main__":
    main()
