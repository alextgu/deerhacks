"""
Vector Extraction Pipeline
Google Takeout (Gemini) JSON → User messages → Gemini Pro → 50-variable personality vector

Usage:
    pip install google-generativeai
    export GEMINI_API_KEY="your_key"
    python vector_extraction.py --input MyActivity.json --output my_vector.json
"""

import json
import re
import os
import argparse
from typing import Optional
from google import genai
from google.genai import types

from dotenv import load_dotenv
load_dotenv()


# ── 1. PARSE & SCRUB (reused from archetype pipeline) ────────────────────────

def extract_user_messages(filepath: str) -> list[dict]:
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    messages = []
    for entry in data:
        title = entry.get("title", "")
        if title.startswith("Prompted "):
            user_text = title[len("Prompted "):].strip()
            if user_text:
                messages.append({
                    "time": entry.get("time", ""),
                    "message": user_text
                })

    messages.sort(key=lambda x: x["time"])
    return messages


def scrub_pii(text: str) -> str:
    text = re.sub(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', '[EMAIL]', text)
    text = re.sub(r'\b(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\b', '[PHONE]', text)
    text = re.sub(r'https?://\S+', '[URL]', text)
    return text


def build_corpus(messages: list[dict], max_chars: int = 40000) -> str:
    lines = []
    total = 0
    for i, m in enumerate(messages, 1):
        line = f"{i}. {m['message']}"
        total += len(line)
        if total > max_chars:
            break
        lines.append(line)
    return "\n".join(lines)


# ── 2. VARIABLE DEFINITIONS ───────────────────────────────────────────────────

# Each variable: (name, low_description, high_description)
VARIABLES = [
    # Cognitive Style
    ("abstract_thinking",        "Concrete and literal",                  "Conceptual and theoretical"),
    ("systems_thinking",         "Sees individual parts",                  "Sees whole systems and interdependencies"),
    ("novelty_seeking",          "Prefers familiar and proven",            "Constantly explores new ideas and domains"),
    ("detail_orientation",       "Big picture only",                       "Obsessed with specifics and precision"),
    ("decisiveness",             "Deliberates extensively before deciding","Jumps to conclusions quickly"),
    ("pattern_recognition",      "Takes things at face value",             "Spots trends and hidden connections instantly"),
    ("risk_tolerance",           "Avoids uncertainty at all costs",        "Actively embraces risk and uncertainty"),
    ("contrarianism",            "Accepts consensus and convention",       "Challenges every assumption and norm"),
    ("depth_vs_breadth",         "Goes very deep on few things",           "Broad knowledge across many domains"),

    # Emotional Profile
    ("emotional_expressiveness", "Guarded and clinical",                   "Openly expressive and emotive"),
    ("hotheadedness",            "Consistently even-keeled",               "Flares up quickly when frustrated"),
    ("empathy_signaling",        "Task-focused, unsentimental",            "Deeply attuned to others' feelings"),
    ("self_criticism",           "Self-assured, minimal self-doubt",       "Highly self-critical and reflective"),
    ("confidence_oscillation",   "Stable, consistent confidence",          "Swings between self-doubt and certainty"),
    ("optimism",                 "Pessimistic or starkly realistic",       "Strongly and consistently optimistic"),
    ("vulnerability",            "Never reveals struggle or weakness",     "Openly shares difficulties and uncertainty"),
    ("emotional_neediness",      "Emotionally self-sufficient",            "Frequently seeks validation or support"),
    ("intensity",                "Laid back, low emotional stakes",        "Everything feels high-stakes and urgent"),
    ("frustration_tolerance",    "Gives up or snaps quickly",              "Extremely patient under pressure"),

    # Collaboration & Work Style
    ("leadership_drive",         "Happy to follow others' lead",           "Naturally and consistently takes charge"),
    ("structure_need",           "Thrives in ambiguity and chaos",         "Needs clear process and defined structure"),
    ("feedback_receptivity",     "Defensive when criticized",              "Actively seeks and welcomes criticism"),
    ("execution_bias",           "Thinks and plans extensively",           "Biased toward action and shipping"),
    ("async_preference",         "Real-time, in-person communication",     "Prefers async, written, independent work"),
    ("ownership_taking",         "Diffuses responsibility to the group",   "Takes full personal ownership of outcomes"),
    ("perfectionism",            "Done is better than perfect",            "Never satisfied, always refines"),
    ("collaboration_enjoyment",  "Prefers working alone",                  "Energized by working with others"),
    ("adaptability",             "Rigid, consistent in approach",          "Constantly pivots and adapts"),
    ("deadline_orientation",     "Stressed and avoidant under pressure",   "Thrives and focuses under deadline pressure"),

    # Values & Motivation
    ("intrinsic_motivation",     "Externally driven by rewards/status",    "Purely self-motivated, internal compass"),
    ("impact_orientation",       "Personal gain and self-interest",        "Mission-driven, societal impact focus"),
    ("ambition",                 "Content, low personal drive",            "Extremely driven, always pushing further"),
    ("ethical_sensitivity",      "Pragmatic, ends justify means",          "Deeply principled, ethics non-negotiable"),
    ("competitiveness",          "Non-competitive, collaborative mindset", "Highly competitive, plays to win"),
    ("loyalty",                  "Transactional relationships",            "Deeply loyal to people and ideas"),
    ("independence_value",       "Needs community and belonging",          "Values autonomy and independence above all"),
    ("intellectual_humility",    "Certain of own views and correctness",   "Genuinely open to being wrong"),
    ("long_term_thinking",       "Lives in the moment, short horizon",     "Always thinking in years and decades"),

    # Communication
    ("directness",               "Diplomatic and indirect",                "Blunt and unfiltered"),
    ("verbosity",                "Terse and minimal",                      "Elaborate and wordy"),
    ("humor_frequency",          "Serious, rarely jokes",                  "Jokes and plays constantly"),
    ("humor_style",              "Dry, sarcastic, dark",                   "Warm, playful, wholesome"),
    ("question_asking_rate",     "Tells more than asks",                   "Constantly curious, asks everything"),
    ("formality",                "Always casual and relaxed",              "Always professional and formal"),
    ("storytelling_tendency",    "Just the facts",                         "Wraps everything in narrative and metaphor"),

    # Identity & Lifestyle
    ("social_energy",            "Deeply introverted",                     "Extremely extroverted"),
    ("routine_vs_spontaneity",   "Loves routine and predictability",       "Completely spontaneous"),
    ("creative_drive",           "Analytical and logical",                 "Highly creative and expressive"),
    ("physical_lifestyle",       "Sedentary, indoor-focused",              "Active, outdoorsy"),
    ("life_pace",                "Slow and deliberate",                    "Fast-moving, always on"),
]

assert len(VARIABLES) == 50, f"Expected 50 variables, got {len(VARIABLES)}"

VARIABLE_NAMES = [v[0] for v in VARIABLES]


# ── 3. GEMINI PROMPT ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are an expert psychologist and behavioral analyst.
You will receive a numbered list of messages a person sent to an AI assistant.
These are their unfiltered, genuine thoughts — what they actually care about,
how they think, and who they really are.

Your job is to score them on 50 personality variables, each from 0.0 to 1.0.

Rules:
- Base every score on actual evidence in the messages. Do not generalize.
- Use the full range. Don't cluster everything around 0.5.
- If there is no evidence for a variable, score it 0.5 (neutral/unknown).
- Return ONLY a valid JSON object. No markdown, no explanation, no code fences.
""".strip()


def build_variable_block() -> str:
    lines = []
    for i, (name, low, high) in enumerate(VARIABLES, 1):
        lines.append(f'{i:02d}. "{name}": 0="{low}" | 1="{high}"')
    return "\n".join(lines)


def build_extraction_prompt(corpus: str) -> str:
    var_block = build_variable_block()

    # Build the empty JSON template so Gemini knows exactly what to return
    empty_scores = {name: 0.0 for name in VARIABLE_NAMES}
    empty_evidence = {name: "" for name in VARIABLE_NAMES}

    template = {
        "scores": empty_scores,
        "evidence": empty_evidence,
        "message_count_used": 0,
        "confidence": ""
    }

    return f"""
Here are the user's messages to their AI assistant, in chronological order:

<messages>
{corpus}
</messages>

Score this person on each of the following 50 personality variables (0.0 to 1.0):

{var_block}

Return a JSON object with exactly this structure:
{json.dumps(template, indent=2)}

Instructions:
- "scores": all 50 variables scored 0.0–1.0
- "evidence": for each variable, a SHORT quote or pattern from the messages that justifies the score. 
  If no evidence exists, write "no signal".
- "message_count_used": how many messages you analyzed
- "confidence": one of "high", "medium", "low" — based on how many messages were available
  and how revealing they were

Do not omit any variable. Do not add extra fields.
""".strip()


# ── 4. CALL GEMINI ────────────────────────────────────────────────────────────

def extract_vector(corpus: str, api_key: Optional[str] = None) -> dict:
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Set GEMINI_API_KEY env var or pass api_key param")

    client = genai.Client(api_key=key)
    prompt = build_extraction_prompt(corpus)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
            response_mime_type="application/json"
        )
    )

    raw = response.text.strip()
    # Safety strip in case mime type is ignored
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'^```\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    result = json.loads(raw)

    # Validate all 50 variables are present
    scores = result.get("scores", {})
    missing = [name for name in VARIABLE_NAMES if name not in scores]
    if missing:
        raise ValueError(f"Gemini response missing variables: {missing}")

    # Clamp all scores to [0, 1] in case of model drift
    for name in VARIABLE_NAMES:
        scores[name] = max(0.0, min(1.0, float(scores[name])))

    result["scores"] = scores
    return result


# ── 5. MAIN PIPELINE ──────────────────────────────────────────────────────────

def run_pipeline(input_path: str, api_key: Optional[str] = None, output_path: Optional[str] = None) -> dict:
    print(f"[1/4] Parsing {input_path}...")
    messages = extract_user_messages(input_path)
    print(f"      Found {len(messages)} user messages")

    if len(messages) < 10:
        print("      WARNING: Very few messages — confidence will be low")

    print("[2/4] Scrubbing PII...")
    for m in messages:
        m["message"] = scrub_pii(m["message"])

    print("[3/4] Building corpus...")
    corpus = build_corpus(messages, max_chars=40000)
    print(f"      Corpus: {len(corpus.split())} words from {min(len(messages), 999)} messages")

    print("[4/4] Calling Gemini Pro for vector extraction...")
    result = extract_vector(corpus, api_key=api_key)

    # Pretty print summary
    print("\n── SCORES ──────────────────────────────────────────")
    scores = result["scores"]
    for group_name, start, end in [
        ("Cognitive Style",        0,  9),
        ("Emotional Profile",      9,  19),
        ("Collaboration & Work",   19, 29),
        ("Values & Motivation",    29, 38),
        ("Communication",          38, 45),
        ("Identity & Lifestyle",   45, 50),
    ]:
        print(f"\n  {group_name}")
        for name in VARIABLE_NAMES[start:end]:
            bar_len = int(scores[name] * 20)
            bar = "█" * bar_len + "░" * (20 - bar_len)
            print(f"    {name:<30} {bar} {scores[name]:.2f}")

    print(f"\n  Confidence: {result.get('confidence', '?')} | Messages analyzed: {result.get('message_count_used', '?')}")

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print(f"\nSaved to {output_path}")

    return result


# ── 6. CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract 50-variable personality vector from Google Takeout Gemini export")
    parser.add_argument("--input",   required=True,                        help="Path to MyActivity.json")
    parser.add_argument("--output",  default="my_vector.json",             help="Output JSON path")
    parser.add_argument("--api-key", default=None,                         help="Gemini API key (or set GEMINI_API_KEY)")
    args = parser.parse_args()

    run_pipeline(
        input_path=args.input,
        api_key=args.api_key,
        output_path=args.output
    )