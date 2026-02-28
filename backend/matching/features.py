"""
features.py
===========
All product features as clean, importable functions.
Frontend guy: every function returns a plain dict — just serialize and send.

FEATURES:
  1.  self_portrait(vector)                          → radar data + highlights
  2.  all_context_scores(vector_a, vector_b)         → scores for all 3 contexts at once
  3.  gemini_blurb(vector_a, vector_b, context, api_key)  → "why you two should connect"
  4.  blind_spot(vector, api_key)                    → what you don't know about yourself
  5.  red_flag_radar(vector_a, vector_b, context)    → private friction warnings
  6.  how_well_do_you_know_me(vector, api_key)       → quiz questions + answer key
  7.  growth_diff(vector_past, vector_now)           → delta per dimension + narrative
  8.  group_match(vectors, names)                    → optimal 4-person hackathon team
  9.  relationship_type(vector_a, vector_b)          → what kind of connection this naturally is
  10. opening_message(vector_a, vector_b, context, api_key) → Gemini-drafted icebreaker
"""

import os
import json
import re
from itertools import combinations
from typing import Optional

from matching import compute_match, result_to_dict, VARIABLE_CONFIG

# ── GEMINI CLIENT ─────────────────────────────────────────────────────────────

def _gemini(prompt: str, system: str, api_key: str, temperature: float = 0.7) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            response_mime_type="application/json"
        )
    )
    raw = response.text.strip()
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'^```\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return raw


def _get_api_key(api_key: Optional[str]) -> str:
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Provide api_key or set GEMINI_API_KEY env var")
    return key


# ── DIMENSION CONFIG (shared) ─────────────────────────────────────────────────

DIMENSIONS = {
    "Cognitive Style": [
        "abstract_thinking", "systems_thinking", "novelty_seeking",
        "detail_orientation", "decisiveness", "pattern_recognition",
        "risk_tolerance", "contrarianism", "depth_vs_breadth"
    ],
    "Emotional Profile": [
        "emotional_expressiveness", "hotheadedness", "empathy_signaling",
        "self_criticism", "confidence_oscillation", "optimism",
        "vulnerability", "emotional_neediness", "intensity", "frustration_tolerance"
    ],
    "Collaboration & Work": [
        "leadership_drive", "structure_need", "feedback_receptivity",
        "execution_bias", "async_preference", "ownership_taking",
        "perfectionism", "collaboration_enjoyment", "adaptability", "deadline_orientation"
    ],
    "Values & Motivation": [
        "intrinsic_motivation", "impact_orientation", "ambition",
        "ethical_sensitivity", "competitiveness", "loyalty",
        "independence_value", "intellectual_humility", "long_term_thinking"
    ],
    "Communication": [
        "directness", "verbosity", "humor_frequency", "humor_style",
        "question_asking_rate", "formality", "storytelling_tendency"
    ],
    "Identity & Lifestyle": [
        "social_energy", "routine_vs_spontaneity", "creative_drive",
        "physical_lifestyle", "life_pace"
    ],
}

CONTEXTS = ["hackathon", "romantic", "friendship"]


def _dim_averages(vector: dict) -> dict:
    raw = vector["scores"]
    return {
        dim: round(sum(raw.get(v, 0.5) for v in vars_) / len(vars_), 3)
        for dim, vars_ in DIMENSIONS.items()
    }


# ═════════════════════════════════════════════════════════════════════════════
# 1. SELF PORTRAIT
# ═════════════════════════════════════════════════════════════════════════════

def self_portrait(vector: dict) -> dict:
    """
    Returns all data needed to render the self-portrait spider chart
    plus highlight cards.

    Returns:
        {
            dimension_scores: {dim: float},   # 6 values for radar axes
            all_scores: {var: float},          # all 50 for detailed view
            highest: {variable, value, label},
            lowest:  {variable, value, label},
            confidence: str,
            message_count: int,
            top5: [{variable, value, label}],  # top 5 strongest traits
            bottom5: [{variable, value, label}]
        }
    """
    scores = vector["scores"]
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    def fmt(var, val):
        return {"variable": var, "label": var.replace("_", " ").title(), "value": round(val, 3)}

    return {
        "dimension_scores": _dim_averages(vector),
        "all_scores": {k: round(v, 3) for k, v in scores.items()},
        "highest":  fmt(*sorted_scores[0]),
        "lowest":   fmt(*sorted_scores[-1]),
        "top5":    [fmt(v, s) for v, s in sorted_scores[:5]],
        "bottom5": [fmt(v, s) for v, s in sorted_scores[-5:]],
        "confidence":    vector.get("confidence", "unknown"),
        "message_count": vector.get("message_count_used", 0),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 2. ALL-CONTEXT SCORES
# ═════════════════════════════════════════════════════════════════════════════

def all_context_scores(vector_a: dict, vector_b: dict) -> dict:
    """
    Score two people across all three contexts simultaneously.
    This is the unified match card — "we don't sort people into boxes."

    Returns:
        {
            hackathon:  {score, grade, dimension_scores, top_strengths, top_tensions, ...},
            romantic:   {...},
            friendship: {...},
            best_context: "hackathon" | "romantic" | "friendship",
            summary: "You two are built to build together"
        }
    """
    results = {ctx: result_to_dict(compute_match(vector_a, vector_b, ctx)) for ctx in CONTEXTS}
    best = max(results, key=lambda c: results[c]["score"])

    summaries = {
        "hackathon":  "You two are built to build together",
        "romantic":   "This could be something real",
        "friendship": "A deep friendship waiting to happen",
    }

    return {
        **results,
        "best_context": best,
        "summary": summaries[best],
    }


# ═════════════════════════════════════════════════════════════════════════════
# 3. GEMINI BLURB
# ═════════════════════════════════════════════════════════════════════════════

def gemini_blurb(vector_a: dict, vector_b: dict, context: str,
                 name_a: str = "Person A", name_b: str = "Person B",
                 api_key: Optional[str] = None) -> dict:
    """
    Generate a personalized "why you two should connect" blurb via Gemini.

    Returns:
        {
            blurb: str,           # 2-3 sentence human-readable connection reason
            hook:  str,           # one punchy headline sentence
            shared_traits: [str], # 2-3 things they have in common
            complementary: [str], # 2-3 ways they fill each other's gaps
        }
    """
    key = _get_api_key(api_key)
    match = result_to_dict(compute_match(vector_a, vector_b, context))

    evidence_a = vector_a.get("evidence", {})
    evidence_b = vector_b.get("evidence", {})

    # Pull evidence for top strengths and tensions
    strength_evidence = []
    for s in match["top_strengths"][:3]:
        var = s["variable"]
        ea = evidence_a.get(var, "")
        eb = evidence_b.get(var, "")
        if ea and ea != "no signal": strength_evidence.append(f"{var}: '{ea}' / '{eb}'")

    tension_evidence = []
    for t in match["top_tensions"][:2]:
        var = t["variable"]
        ea = evidence_a.get(var, "")
        eb = evidence_b.get(var, "")
        if ea and ea != "no signal": tension_evidence.append(f"{var}: '{ea}' / '{eb}'")

    system = "You are a warm, insightful matchmaker who writes honest, specific connection blurbs. Never generic. Always grounded in real evidence. Return only valid JSON."

    prompt = f"""
Two people are being matched for: {context.upper()}

{name_a}'s top traits: {json.dumps(match['top_strengths'][:3])}
{name_b}'s top traits: {json.dumps(match['top_strengths'][:3])}

Compatibility score: {match['score']:.0%} ({match['grade']})

Evidence from their actual AI conversations:
Strengths: {json.dumps(strength_evidence)}
Tensions:  {json.dumps(tension_evidence)}

Clashes:   {json.dumps(match['clash_penalties'])}
Bonuses:   {json.dumps(match['bonuses'])}

Write a connection blurb. Return JSON:
{{
  "hook": "<one punchy sentence, max 12 words, why this pairing is special>",
  "blurb": "<2-3 sentences. Specific, warm, honest. Reference actual traits. Don't mention scores.>",
  "shared_traits": ["<trait they both have>", "<trait>"],
  "complementary": ["<how A fills B's gap>", "<how B fills A's gap>"]
}}
"""
    result = json.loads(_gemini(prompt, system, key, temperature=0.8))
    result["score"] = match["score"]
    result["grade"] = match["grade"]
    result["context"] = context
    return result


# ═════════════════════════════════════════════════════════════════════════════
# 4. BLIND SPOT
# ═════════════════════════════════════════════════════════════════════════════

def blind_spot(vector: dict, name: str = "you", api_key: Optional[str] = None) -> dict:
    """
    Tells the user what they might not know about themselves.
    Works both ways — can reveal hidden strengths AND uncomfortable truths.
    Framed with honesty and care, never cruelty.

    Returns:
        {
            hidden_strengths: [{trait, insight, score}],   # underrated qualities
            growth_edges:     [{trait, insight, score}],   # uncomfortable truths
            pattern:          str,  # one overarching observation
            reframe:          str,  # one empowering reframe of their profile
        }
    """
    key = _get_api_key(api_key)
    scores = vector["scores"]
    evidence = vector.get("evidence", {})

    # Find surprising combinations — high on X but low on Y where they're correlated
    surprising = []
    pairs = [
        ("empathy_signaling", "emotional_neediness", "High empathy but also high neediness"),
        ("intellectual_humility", "contrarianism",   "Open to being wrong but rarely challenges others"),
        ("ambition", "execution_bias",               "Ambitious but not wired to just ship"),
        ("leadership_drive", "collaboration_enjoyment", "Wants to lead but loves collaboration"),
        ("vulnerability", "emotional_expressiveness",   "Opens up but doesn't always show it"),
        ("optimism", "long_term_thinking",           "Optimistic but lives in the present"),
    ]
    for var_a, var_b, label in pairs:
        sa, sb = scores.get(var_a, 0.5), scores.get(var_b, 0.5)
        if abs(sa - sb) > 0.35:
            surprising.append({"pair": f"{var_a} vs {var_b}", "label": label,
                                "a": round(sa, 2), "b": round(sb, 2)})

    system = "You are an empathetic but honest psychologist. You reveal blind spots with care — both hidden strengths the person underestimates, and growth edges they may not see. Never cruel. Always specific. Return only valid JSON."

    prompt = f"""
Here is someone's personality vector extracted from their AI conversations:

Top 10 scores: {json.dumps(sorted(scores.items(), key=lambda x: x[1], reverse=True)[:10])}
Bottom 10 scores: {json.dumps(sorted(scores.items(), key=lambda x: x[1])[:10])}
Surprising combinations: {json.dumps(surprising[:4])}

Selected evidence from their messages:
{json.dumps({k: v for k, v in list(evidence.items())[:15] if v != 'no signal'})}

Generate their blind spot report. Be specific and grounded in the data.
The "growth_edges" should be honest — tell them what they might not want to hear, but frame it as opportunity, not criticism. This can include things like "you're lowkey a pushover" or "you seek more validation than you realize."

Return JSON:
{{
  "hidden_strengths": [
    {{"trait": "<var name>", "score": 0.0, "insight": "<what this score reveals that they probably underestimate about themselves>"}},
    {{"trait": "<var name>", "score": 0.0, "insight": "<insight>"}}
  ],
  "growth_edges": [
    {{"trait": "<var name>", "score": 0.0, "insight": "<honest, caring observation about what holds them back>"}},
    {{"trait": "<var name>", "score": 0.0, "insight": "<insight>"}}
  ],
  "pattern": "<one overarching observation about who this person really is, in 1-2 sentences>",
  "reframe": "<one empowering reframe — take something that looks like a weakness and show why it's actually a strength in the right context>"
}}
"""
    return json.loads(_gemini(prompt, system, key, temperature=0.75))


# ═════════════════════════════════════════════════════════════════════════════
# 5. RED FLAG RADAR
# ═════════════════════════════════════════════════════════════════════════════

def red_flag_radar(vector_a: dict, vector_b: dict, context: str) -> dict:
    """
    Private friction warnings shown only to the requesting user.
    Not shown to the other person. Helps them go in with eyes open.

    Returns:
        {
            flags: [{variable, severity, warning}],
            overall_risk: "low" | "medium" | "high",
            advice: str
        }
    """
    a = vector_a["scores"]
    b = vector_b["scores"]

    flags = []

    # Universal red flags
    checks = [
        # (condition_fn, severity, warning)
        (
            lambda: a.get("hotheadedness", 0.5) > 0.7 and b.get("hotheadedness", 0.5) > 0.7,
            "high",
            "hotheadedness",
            "Both of you flare up quickly. Under stress — deadlines, disagreements — this could escalate fast."
        ),
        (
            lambda: abs(a.get("directness", 0.5) - b.get("directness", 0.5)) > 0.6,
            "medium",
            "directness_gap",
            "One of you is very direct, the other very diplomatic. What feels honest to one may feel harsh to the other."
        ),
        (
            lambda: abs(a.get("life_pace", 0.5) - b.get("life_pace", 0.5)) > 0.6,
            "medium",
            "life_pace_gap",
            "Your life paces are very different. One of you is always moving, the other more deliberate. This creates friction over time."
        ),
        (
            lambda: a.get("feedback_receptivity", 0.5) < 0.35 or b.get("feedback_receptivity", 0.5) < 0.35,
            "medium",
            "feedback_receptivity",
            "One of you struggles to receive criticism. Honest conversations may feel like attacks."
        ),
        (
            lambda: a.get("emotional_neediness", 0.5) > 0.75 and b.get("emotional_neediness", 0.5) > 0.75,
            "medium",
            "mutual_neediness",
            "Both of you seek emotional support and validation. Neither may have enough to give the other."
        ),
        (
            lambda: abs(a.get("structure_need", 0.5) - b.get("structure_need", 0.5)) > 0.65 and context == "hackathon",
            "high",
            "structure_mismatch",
            "One of you needs clear process and plans; the other thrives in chaos. At 3am with 6 hours left, this will be a problem."
        ),
        (
            lambda: a.get("leadership_drive", 0.5) > 0.8 and b.get("leadership_drive", 0.5) > 0.8 and context == "hackathon",
            "high",
            "dual_leadership",
            "Both of you naturally take charge. Without an explicit role split upfront, expect power struggles."
        ),
        (
            lambda: abs(a.get("long_term_thinking", 0.5) - b.get("long_term_thinking", 0.5)) > 0.6 and context == "romantic",
            "high",
            "horizon_mismatch",
            "One of you thinks in years and decades; the other lives in the present. Conversations about the future may feel threatening to one of you."
        ),
        (
            lambda: abs(a.get("independence_value", 0.5) - b.get("independence_value", 0.5)) > 0.6 and context == "romantic",
            "medium",
            "independence_gap",
            "One of you needs a lot of space and autonomy; the other values closeness and togetherness. This tension needs explicit conversation early."
        ),
        (
            lambda: a.get("intellectual_humility", 0.5) < 0.3 and b.get("intellectual_humility", 0.5) < 0.3,
            "medium",
            "low_mutual_humility",
            "Neither of you finds it easy to admit you're wrong. Disagreements may turn into standoffs."
        ),
    ]

    for condition, severity, variable, warning in checks:
        try:
            if condition():
                flags.append({"variable": variable, "severity": severity, "warning": warning})
        except Exception:
            pass

    high_count = sum(1 for f in flags if f["severity"] == "high")
    med_count  = sum(1 for f in flags if f["severity"] == "medium")

    if high_count >= 2 or (high_count >= 1 and med_count >= 2):
        overall_risk = "high"
        advice = "There are some real friction points here. That doesn't mean it won't work — but go in with eyes open and set expectations early."
    elif high_count == 1 or med_count >= 2:
        overall_risk = "medium"
        advice = "A few things worth being aware of. Most of these are manageable with good communication."
    else:
        overall_risk = "low"
        advice = "No major red flags. The friction points that exist are normal and workable."

    return {
        "flags": flags,
        "overall_risk": overall_risk,
        "advice": advice,
        "context": context,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 6. HOW WELL DO YOU KNOW ME
# ═════════════════════════════════════════════════════════════════════════════

def how_well_do_you_know_me(vector: dict, name: str = "them",
                             api_key: Optional[str] = None) -> dict:
    """
    Generates a quiz where someone guesses the user's scores.
    Share with a friend — see how well they really know you.

    Returns:
        {
            questions: [
                {
                    id: int,
                    question: str,
                    variable: str,
                    correct_answer: float,       # actual score
                    correct_label: str,          # human-readable
                    options: [str],              # 4 multiple choice options
                    correct_index: int,          # 0-3
                    evidence: str               # what the data shows
                }
            ],
            scoring: {perfect: str, good: str, okay: str, miss: str}
        }
    """
    key = _get_api_key(api_key)
    scores = vector["scores"]
    evidence = vector.get("evidence", {})

    # Pick 8 most signal-rich variables (non-neutral scores, has evidence)
    candidates = [
        (var, scores[var], evidence.get(var, ""))
        for var in scores
        if abs(scores[var] - 0.5) > 0.2 and evidence.get(var, "no signal") != "no signal"
    ]
    candidates.sort(key=lambda x: abs(x[1] - 0.5), reverse=True)
    selected = candidates[:8]

    system = "You generate personality quiz questions. Each question asks someone to guess how a person scored on a trait based on knowing them. Return only valid JSON."

    prompt = f"""
Generate 8 quiz questions for a "how well do you know me" personality quiz.
The quiz-taker is guessing scores for: {name}

Variables to quiz (name, actual_score 0-1, evidence from their AI messages):
{json.dumps([{"variable": v, "score": round(s, 2), "evidence": e} for v, s, e in selected])}

For each variable, write a natural question (not "what is their score on X" — make it feel human).
Give 4 multiple choice options as plain English descriptions (not numbers).
Mark which is correct.

Return JSON:
{{
  "questions": [
    {{
      "id": 1,
      "question": "<natural human question about this trait>",
      "variable": "<variable_name>",
      "correct_answer": 0.0,
      "correct_label": "<plain english description of what the score means>",
      "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correct_index": 0,
      "evidence": "<brief quote from their messages that reveals this>"
    }}
  ],
  "scoring": {{
    "perfect": "<message for 8/8>",
    "good":    "<message for 6-7/8>",
    "okay":    "<message for 4-5/8>",
    "miss":    "<message for <4/8>"
  }}
}}
"""
    return json.loads(_gemini(prompt, system, key, temperature=0.7))


# ═════════════════════════════════════════════════════════════════════════════
# 7. GROWTH DIFF
# ═════════════════════════════════════════════════════════════════════════════

def growth_diff(vector_past: dict, vector_now: dict,
                label_past: str = "6 months ago",
                label_now: str  = "today") -> dict:
    """
    Compare two snapshots of the same person over time.
    No Gemini needed — pure math + labels.

    Returns:
        {
            dimension_deltas: {dim: delta},    # positive = grew, negative = regressed
            variable_deltas:  {var: delta},    # all 50
            biggest_growth:   {variable, delta, label},
            biggest_regression: {variable, delta, label},
            most_stable:      {variable, delta, label},
            overall_change:   float,           # mean absolute delta across all vars
            narrative:        str,             # text summary
            past_dim_scores:  {dim: float},
            now_dim_scores:   {dim: float},
        }
    """
    past_scores = vector_past["scores"]
    now_scores  = vector_now["scores"]

    var_deltas = {
        var: round(now_scores.get(var, 0.5) - past_scores.get(var, 0.5), 3)
        for var in now_scores
    }

    dim_deltas = {}
    for dim, vars_ in DIMENSIONS.items():
        past_avg = sum(past_scores.get(v, 0.5) for v in vars_) / len(vars_)
        now_avg  = sum(now_scores.get(v, 0.5)  for v in vars_) / len(vars_)
        dim_deltas[dim] = round(now_avg - past_avg, 3)

    sorted_deltas = sorted(var_deltas.items(), key=lambda x: x[1])
    biggest_regression_var, biggest_regression_val = sorted_deltas[0]
    biggest_growth_var, biggest_growth_val         = sorted_deltas[-1]
    most_stable_var = min(var_deltas, key=lambda v: abs(var_deltas[v]))

    def fmt(var, delta):
        return {"variable": var, "label": var.replace("_", " ").title(), "delta": delta}

    overall_change = round(sum(abs(d) for d in var_deltas.values()) / len(var_deltas), 3)

    # Simple narrative
    grew    = [v for v, d in var_deltas.items() if d >  0.1]
    dropped = [v for v, d in var_deltas.items() if d < -0.1]
    if overall_change < 0.05:
        narrative = f"You've been remarkably consistent between {label_past} and {label_now}. Your core personality is stable."
    elif len(grew) > len(dropped):
        top = biggest_growth_var.replace("_", " ")
        narrative = f"You've grown significantly since {label_past}, especially in {top}. {len(grew)} traits strengthened, {len(dropped)} softened."
    else:
        narrative = f"A period of change and recalibration between {label_past} and {label_now}. Some edges softened, some sharpened."

    return {
        "dimension_deltas":     dim_deltas,
        "variable_deltas":      var_deltas,
        "biggest_growth":       fmt(biggest_growth_var, biggest_growth_val),
        "biggest_regression":   fmt(biggest_regression_var, biggest_regression_val),
        "most_stable":          fmt(most_stable_var, var_deltas[most_stable_var]),
        "overall_change":       overall_change,
        "narrative":            narrative,
        "past_dim_scores":      _dim_averages(vector_past),
        "now_dim_scores":       _dim_averages(vector_now),
        "label_past":           label_past,
        "label_now":            label_now,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 8. GROUP MATCH — optimal hackathon team of 4
# ═════════════════════════════════════════════════════════════════════════════

def group_match(vectors: list[dict], names: list[str]) -> dict:
    """
    Given a pool of people, find the optimal 4-person hackathon team.
    Scores teams on: pairwise compatibility average + role coverage bonus.

    Returns:
        {
            optimal_team: [name, name, name, name],
            team_score:   float,
            pairwise_scores: {"{nameA} x {nameB}": score},
            coverage_analysis: {
                dimension: {best_person: name, score: float}
            },
            coverage_gaps: [dimension],   # dims where team avg < 0.45
            coverage_strengths: [dimension],
            runner_up_teams: [  # top 3 alternatives
                {members: [names], score: float}
            ]
        }
    """
    assert len(vectors) >= 4, "Need at least 4 people to form a team"
    assert len(vectors) == len(names)

    pool = list(zip(names, vectors))

    def team_score(combo: list) -> float:
        combo_names, combo_vectors = zip(*combo)

        # Pairwise hackathon compatibility average
        pairs = list(combinations(range(len(combo)), 2))
        pair_scores = []
        for i, j in pairs:
            result = compute_match(combo_vectors[i], combo_vectors[j], "hackathon")
            pair_scores.append(result.score)
        avg_pairwise = sum(pair_scores) / len(pair_scores)

        # Role coverage bonus — reward teams that cover all dimensions well
        # Key hackathon dimensions and what score means "covered"
        key_vars = {
            "execution_bias":      0.65,   # someone who ships
            "systems_thinking":    0.65,   # someone who architects
            "detail_orientation":  0.60,   # someone who catches bugs
            "leadership_drive":    0.65,   # someone who drives
            "creativity":          0.60,   # creative thinker (use novelty_seeking)
        }
        # Use novelty_seeking as proxy for creativity
        actual_key_vars = {
            "execution_bias":     "execution_bias",
            "systems_thinking":   "systems_thinking",
            "detail_orientation": "detail_orientation",
            "leadership_drive":   "leadership_drive",
            "novelty_seeking":    "novelty_seeking",
        }

        coverage_bonus = 0.0
        for role_var, threshold in zip(actual_key_vars.values(), key_vars.values()):
            team_max = max(v["scores"].get(role_var, 0.5) for v in combo_vectors)
            if team_max >= threshold:
                coverage_bonus += 0.02   # small bonus per covered role

        return round(avg_pairwise + coverage_bonus, 4)

    # Score all combinations of 4
    all_combos = list(combinations(pool, 4))
    scored = [(combo, team_score(list(combo))) for combo in all_combos]
    scored.sort(key=lambda x: x[1], reverse=True)

    best_combo, best_score = scored[0]
    best_names   = [n for n, _ in best_combo]
    best_vectors = [v for _, v in best_combo]

    # Pairwise breakdown for the best team
    pairwise = {}
    for i, j in combinations(range(4), 2):
        key = f"{best_names[i]} × {best_names[j]}"
        result = compute_match(best_vectors[i], best_vectors[j], "hackathon")
        pairwise[key] = result.score

    # Coverage analysis
    coverage = {}
    for dim, vars_ in DIMENSIONS.items():
        best_person_idx = max(
            range(4),
            key=lambda i: sum(best_vectors[i]["scores"].get(v, 0.5) for v in vars_) / len(vars_)
        )
        dim_score_val = sum(best_vectors[best_person_idx]["scores"].get(v, 0.5) for v in vars_) / len(vars_)
        coverage[dim] = {"best_person": best_names[best_person_idx], "score": round(dim_score_val, 3)}

    team_dim_avgs = {
        dim: round(sum(
            sum(v["scores"].get(var, 0.5) for var in vars_) / len(vars_)
            for v in best_vectors
        ) / 4, 3)
        for dim, vars_ in DIMENSIONS.items()
    }
    gaps      = [d for d, avg in team_dim_avgs.items() if avg < 0.45]
    strengths = [d for d, avg in team_dim_avgs.items() if avg > 0.65]

    # Runner-ups (next 3 best teams)
    runner_ups = [
        {"members": [n for n, _ in combo], "score": score}
        for combo, score in scored[1:4]
    ]

    return {
        "optimal_team":      best_names,
        "team_score":        best_score,
        "pairwise_scores":   pairwise,
        "coverage_analysis": coverage,
        "team_dim_averages": team_dim_avgs,
        "coverage_gaps":     gaps,
        "coverage_strengths": strengths,
        "runner_up_teams":   runner_ups,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 9. RELATIONSHIP TYPE
# ═════════════════════════════════════════════════════════════════════════════

def relationship_type(vector_a: dict, vector_b: dict) -> dict:
    """
    Predict the natural shape of a relationship between two people —
    not what context they're best in, but what kind of dynamic will form.

    Returns:
        {
            type:        str,   # e.g. "The Sparring Partners"
            description: str,   # what this relationship will feel like
            natural_context: str,
            dynamic_tags: [str],
            long_term_outlook: str,
        }
    """
    a = vector_a["scores"]
    b = vector_b["scores"]

    # Compute key signals
    both_intellectual   = a.get("intellectual_humility", 0.5) > 0.6 and b.get("intellectual_humility", 0.5) > 0.6
    both_contrarian     = a.get("contrarianism", 0.5) > 0.6 and b.get("contrarianism", 0.5) > 0.6
    both_empathetic     = a.get("empathy_signaling", 0.5) > 0.7 and b.get("empathy_signaling", 0.5) > 0.7
    both_ambitious      = a.get("ambition", 0.5) > 0.7 and b.get("ambition", 0.5) > 0.7
    both_collaborative  = a.get("collaboration_enjoyment", 0.5) > 0.7 and b.get("collaboration_enjoyment", 0.5) > 0.7
    one_leads           = abs(a.get("leadership_drive", 0.5) - b.get("leadership_drive", 0.5)) > 0.4
    vision_exec_pair    = (a.get("abstract_thinking", 0.5) > 0.7 and b.get("execution_bias", 0.5) > 0.7) or \
                          (b.get("abstract_thinking", 0.5) > 0.7 and a.get("execution_bias", 0.5) > 0.7)
    both_vulnerable     = a.get("vulnerability", 0.5) > 0.65 and b.get("vulnerability", 0.5) > 0.65
    pace_aligned        = abs(a.get("life_pace", 0.5) - b.get("life_pace", 0.5)) < 0.2
    humor_aligned       = abs(a.get("humor_style", 0.5) - b.get("humor_style", 0.5)) < 0.2

    # Rule-based type assignment
    if both_contrarian and both_intellectual:
        rtype = "The Sparring Partners"
        desc  = "You two will debate everything — and never get tired of it. Ideas sharpen against each other like flint."
        tags  = ["intellectual tension", "mutual respect", "endless debate"]
        outlook = "Long-term, this relationship deepens as trust grows. The debates get better with time."
        natural = "friendship"

    elif vision_exec_pair and both_ambitious:
        rtype = "The Dream Team"
        desc  = "One of you sees what could be; the other makes it real. This is the rarest and most powerful pairing."
        tags  = ["visionary + builder", "high output", "complementary roles"]
        outlook = "Explosive in short bursts. Sustainable if you build mutual respect and don't let roles calcify."
        natural = "hackathon"

    elif both_empathetic and both_vulnerable:
        rtype = "The Safe Harbor"
        desc  = "You both open up easily and hold space well. This will become one of those rare relationships where you can say anything."
        tags  = ["deep trust", "emotional safety", "mutual care"]
        outlook = "Slow to form, built to last. The kind of friendship or relationship that defines a chapter of your life."
        natural = "romantic"

    elif both_collaborative and humor_aligned and pace_aligned:
        rtype = "The Easy Ones"
        desc  = "No friction, no performance. You just fit. Conversations flow, silences are comfortable, energy matches."
        tags  = ["effortless chemistry", "shared rhythm", "low maintenance"]
        outlook = "Reliably good. Not always intense, but consistently nourishing."
        natural = "friendship"

    elif one_leads and both_collaborative:
        rtype = "The Mentor & The Builder"
        desc  = "A natural pull toward teaching and learning. One of you has done this before; the other is hungry to grow."
        tags  = ["mentorship dynamic", "knowledge transfer", "guided ambition"]
        outlook = "Transformative for the person learning. Fulfilling for the person teaching. Roles may shift over time."
        natural = "hackathon"

    elif both_ambitious and not both_collaborative:
        rtype = "The Rivals"
        desc  = "Competitive, driven, and deeply aware of each other. You'll push each other to levels neither would reach alone."
        tags  = ["mutual pressure", "competitive respect", "parallel growth"]
        outlook = "Energizing but high-maintenance. Needs clear boundaries to stay healthy."
        natural = "hackathon"

    else:
        rtype = "The Slow Burn"
        desc  = "Not obvious on paper, but something real builds over time. The kind of connection that sneaks up on you."
        tags  = ["gradual depth", "unexpected compatibility", "grows with time"]
        outlook = "Give it time. The best things about this pairing take a while to reveal themselves."
        natural = "friendship"

    return {
        "type":             rtype,
        "description":      desc,
        "natural_context":  natural,
        "dynamic_tags":     tags,
        "long_term_outlook": outlook,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 10. OPENING MESSAGE
# ═════════════════════════════════════════════════════════════════════════════

def opening_message(vector_a: dict, vector_b: dict, context: str,
                    name_a: str = "me", name_b: str = "them",
                    api_key: Optional[str] = None) -> dict:
    """
    Gemini drafts a personalized opening message from A to B.
    Based on both personalities — not generic, not cringe.

    Returns:
        {
            message: str,
            tone: str,
            why_it_works: str,
        }
    """
    key = _get_api_key(api_key)
    a = vector_a["scores"]
    b = vector_b["scores"]

    match = result_to_dict(compute_match(vector_a, vector_b, context))
    rel   = relationship_type(vector_a, vector_b)

    system = "You write opening messages between two people meeting for the first time. Natural, specific, never cringe. Return only valid JSON."

    prompt = f"""
{name_a} wants to send an opening message to {name_b} for context: {context.upper()}

About {name_a}:
- Directness: {a.get('directness', 0.5):.2f} (0=diplomatic, 1=blunt)
- Humor: {a.get('humor_frequency', 0.5):.2f} frequency, {a.get('humor_style', 0.5):.2f} style (0=dry, 1=warm)
- Formality: {a.get('formality', 0.5):.2f}

About {name_b}:
- Directness: {b.get('directness', 0.5):.2f}
- Humor preference: {b.get('humor_frequency', 0.5):.2f}
- Emotional expressiveness: {b.get('emotional_expressiveness', 0.5):.2f}

Relationship type: {rel['type']} — {rel['description']}
Top shared trait: {match['top_strengths'][0]['variable'] if match['top_strengths'] else 'curiosity'}
Compatibility: {match['score']:.0%}

Write a short, natural opening message from {name_a} to {name_b}.
It should be calibrated to BOTH personalities — not too intense for someone low on expressiveness,
not too dry for someone who loves warm humor.
Do NOT mention the app, scores, or AI.
Keep it under 3 sentences.

Return JSON:
{{
  "message": "<the opening message>",
  "tone": "<one word describing the tone>",
  "why_it_works": "<one sentence explaining why this message works for this specific pairing>"
}}
"""
    return json.loads(_gemini(prompt, system, key, temperature=0.85))


# ═════════════════════════════════════════════════════════════════════════════
# QUICK TEST
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    # Load two test vectors
    with open(sys.argv[1] if len(sys.argv) > 1 else "my_vector.json")     as f: va = json.load(f)
    with open(sys.argv[2] if len(sys.argv) > 2 else "their_vector.json")  as f: vb = json.load(f)

    print("\n── 1. SELF PORTRAIT ──────────────────────────────────")
    print(json.dumps(self_portrait(va), indent=2))

    print("\n── 2. ALL CONTEXT SCORES ─────────────────────────────")
    print(json.dumps(all_context_scores(va, vb), indent=2))

    print("\n── 5. RED FLAG RADAR ─────────────────────────────────")
    print(json.dumps(red_flag_radar(va, vb, "hackathon"), indent=2))

    print("\n── 7. GROWTH DIFF ────────────────────────────────────")
    print(json.dumps(growth_diff(va, vb, "last year", "today"), indent=2))

    print("\n── 9. RELATIONSHIP TYPE ──────────────────────────────")
    print(json.dumps(relationship_type(va, vb), indent=2))

    # Gemini features — only run if API key is present
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        print("\n── 3. GEMINI BLURB ───────────────────────────────────")
        print(json.dumps(gemini_blurb(va, vb, "hackathon", api_key=api_key), indent=2))

        print("\n── 4. BLIND SPOT ─────────────────────────────────────")
        print(json.dumps(blind_spot(va, api_key=api_key), indent=2))

        print("\n── 10. OPENING MESSAGE ───────────────────────────────")
        print(json.dumps(opening_message(va, vb, "hackathon", api_key=api_key), indent=2))
    else:
        print("\n(Set GEMINI_API_KEY to test Gemini features 3, 4, 6, 10)")