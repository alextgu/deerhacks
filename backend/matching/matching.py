"""
Matching Engine
Two personality vectors + context → compatibility score + breakdown

Usage:
    python3 match.py --a nice_vector.json --b their_vector.json --context hackathon
    python3 match.py --a nice_vector.json --b their_vector.json --context romantic
    python3 match.py --a nice_vector.json --b their_vector.json --context friendship
"""

import json
import argparse
from dataclasses import dataclass

# ── 1. CONFIGURATION ──────────────────────────────────────────────────────────

# For each variable, define:
#   mode: "similarity" (closer = better) or "complement" (further = better)
#   weights: per context [hackathon, romantic, friendship]

VARIABLE_CONFIG = {
    # Cognitive Style
    "abstract_thinking":      {"mode": "similarity",  "hackathon": 0.4, "romantic": 0.5, "friendship": 0.4},
    "systems_thinking":       {"mode": "complement",  "hackathon": 0.8, "romantic": 0.2, "friendship": 0.2},
    "novelty_seeking":        {"mode": "similarity",  "hackathon": 0.6, "romantic": 0.7, "friendship": 0.8},
    "detail_orientation":     {"mode": "complement",  "hackathon": 0.9, "romantic": 0.2, "friendship": 0.2},
    "decisiveness":           {"mode": "complement",  "hackathon": 0.7, "romantic": 0.3, "friendship": 0.3},
    "pattern_recognition":    {"mode": "similarity",  "hackathon": 0.5, "romantic": 0.4, "friendship": 0.4},
    "risk_tolerance":         {"mode": "similarity",  "hackathon": 0.6, "romantic": 0.5, "friendship": 0.4},
    "contrarianism":          {"mode": "complement",  "hackathon": 0.7, "romantic": 0.3, "friendship": 0.4},
    "depth_vs_breadth":       {"mode": "complement",  "hackathon": 0.8, "romantic": 0.3, "friendship": 0.3},

    # Emotional Profile
    "emotional_expressiveness": {"mode": "similarity","hackathon": 0.2, "romantic": 0.8, "friendship": 0.7},
    "hotheadedness":           {"mode": "similarity", "hackathon": 0.5, "romantic": 0.5, "friendship": 0.5},
    "empathy_signaling":       {"mode": "similarity", "hackathon": 0.3, "romantic": 0.9, "friendship": 0.8},
    "self_criticism":          {"mode": "similarity", "hackathon": 0.3, "romantic": 0.5, "friendship": 0.5},
    "confidence_oscillation":  {"mode": "complement", "hackathon": 0.4, "romantic": 0.4, "friendship": 0.4},
    "optimism":                {"mode": "similarity", "hackathon": 0.5, "romantic": 0.7, "friendship": 0.7},
    "vulnerability":           {"mode": "similarity", "hackathon": 0.2, "romantic": 0.9, "friendship": 0.8},
    "emotional_neediness":     {"mode": "complement", "hackathon": 0.3, "romantic": 0.6, "friendship": 0.6},
    "intensity":               {"mode": "similarity", "hackathon": 0.6, "romantic": 0.6, "friendship": 0.5},
    "frustration_tolerance":   {"mode": "similarity", "hackathon": 0.7, "romantic": 0.5, "friendship": 0.5},

    # Collaboration & Work Style
    "leadership_drive":        {"mode": "complement", "hackathon": 1.0, "romantic": 0.4, "friendship": 0.3},
    "structure_need":          {"mode": "complement", "hackathon": 0.8, "romantic": 0.3, "friendship": 0.3},
    "feedback_receptivity":    {"mode": "similarity", "hackathon": 0.9, "romantic": 0.4, "friendship": 0.4},
    "execution_bias":          {"mode": "complement", "hackathon": 0.9, "romantic": 0.2, "friendship": 0.2},
    "async_preference":        {"mode": "similarity", "hackathon": 0.7, "romantic": 0.5, "friendship": 0.4},
    "ownership_taking":        {"mode": "similarity", "hackathon": 0.8, "romantic": 0.3, "friendship": 0.3},
    "perfectionism":           {"mode": "complement", "hackathon": 0.7, "romantic": 0.3, "friendship": 0.3},
    "collaboration_enjoyment": {"mode": "similarity", "hackathon": 0.8, "romantic": 0.6, "friendship": 0.9},
    "adaptability":            {"mode": "similarity", "hackathon": 0.7, "romantic": 0.4, "friendship": 0.4},
    "deadline_orientation":    {"mode": "similarity", "hackathon": 0.8, "romantic": 0.2, "friendship": 0.2},

    # Values & Motivation
    "intrinsic_motivation":    {"mode": "similarity", "hackathon": 0.6, "romantic": 0.7, "friendship": 0.6},
    "impact_orientation":      {"mode": "similarity", "hackathon": 0.5, "romantic": 0.7, "friendship": 0.6},
    "ambition":                {"mode": "similarity", "hackathon": 0.7, "romantic": 0.6, "friendship": 0.5},
    "ethical_sensitivity":     {"mode": "similarity", "hackathon": 0.4, "romantic": 0.9, "friendship": 0.8},
    "competitiveness":         {"mode": "similarity", "hackathon": 0.5, "romantic": 0.4, "friendship": 0.4},
    "loyalty":                 {"mode": "similarity", "hackathon": 0.4, "romantic": 1.0, "friendship": 0.9},
    "independence_value":      {"mode": "similarity", "hackathon": 0.4, "romantic": 0.6, "friendship": 0.5},
    "intellectual_humility":   {"mode": "similarity", "hackathon": 0.6, "romantic": 0.7, "friendship": 0.7},
    "long_term_thinking":      {"mode": "similarity", "hackathon": 0.5, "romantic": 0.8, "friendship": 0.6},

    # Communication
    "directness":              {"mode": "similarity", "hackathon": 0.7, "romantic": 0.6, "friendship": 0.6},
    "verbosity":               {"mode": "similarity", "hackathon": 0.5, "romantic": 0.6, "friendship": 0.6},
    "humor_frequency":         {"mode": "similarity", "hackathon": 0.4, "romantic": 0.8, "friendship": 0.9},
    "humor_style":             {"mode": "similarity", "hackathon": 0.3, "romantic": 0.9, "friendship": 0.8},
    "question_asking_rate":    {"mode": "similarity", "hackathon": 0.5, "romantic": 0.6, "friendship": 0.7},
    "formality":               {"mode": "similarity", "hackathon": 0.6, "romantic": 0.5, "friendship": 0.5},
    "storytelling_tendency":   {"mode": "similarity", "hackathon": 0.3, "romantic": 0.6, "friendship": 0.6},

    # Identity & Lifestyle
    "social_energy":           {"mode": "similarity", "hackathon": 0.4, "romantic": 0.7, "friendship": 0.8},
    "routine_vs_spontaneity":  {"mode": "similarity", "hackathon": 0.3, "romantic": 0.8, "friendship": 0.7},
    "creative_drive":          {"mode": "complement", "hackathon": 0.6, "romantic": 0.5, "friendship": 0.4},
    "physical_lifestyle":      {"mode": "similarity", "hackathon": 0.1, "romantic": 0.7, "friendship": 0.6},
    "life_pace":               {"mode": "similarity", "hackathon": 0.7, "romantic": 0.8, "friendship": 0.7},
}

# Clash penalties: conditions that tank compatibility regardless of other scores
# Each clash: (var, threshold_a, var_b, threshold_b, contexts, penalty)
CLASH_RULES = [
    # Two hotheads who can't take feedback — disaster on any team
    ("hotheadedness", ">", 0.75, "feedback_receptivity", "<", 0.3, ["hackathon", "romantic", "friendship"], -0.15),
    # Two strong leaders with no flexibility — hackathon conflict
    ("leadership_drive", ">", 0.8, "adaptability", "<", 0.3, ["hackathon"], -0.12),
    # Huge directness gap — extreme blunt vs extreme diplomatic
    ("directness", "gap", 0.7, None, None, None, ["hackathon", "romantic", "friendship"], -0.10),
    # Both emotionally needy, neither self-sufficient — romantic codependency risk
    ("emotional_neediness", ">", 0.8, "emotional_neediness", ">", 0.8, ["romantic"], -0.12),
    # Huge life pace gap — one person always moving, one always slow
    ("life_pace", "gap", 0.7, None, None, None, ["romantic", "friendship"], -0.10),
]

# Bonus rules: combinations that deserve a boost
BONUS_RULES = [
    # Both high collaboration enjoyment — great for any context
    ("collaboration_enjoyment", ">", 0.7, "collaboration_enjoyment", ">", 0.7, ["hackathon", "friendship", "romantic"], 0.08),
    # Both high intellectual humility — healthy disagreements
    ("intellectual_humility", ">", 0.7, "intellectual_humility", ">", 0.7, ["hackathon", "romantic", "friendship"], 0.06),
    # High loyalty match — romantic gold
    ("loyalty", ">", 0.7, "loyalty", ">", 0.7, ["romantic", "friendship"], 0.08),
    # One visionary (high abstract) + one executor (high execution_bias) — hackathon dream team
    ("abstract_thinking", ">", 0.7, "execution_bias", ">", 0.7, ["hackathon"], 0.10),
]


# ── 2. SCORING ────────────────────────────────────────────────────────────────

@dataclass
class MatchResult:
    score: float          # 0.0 - 1.0 final compatibility score
    grade: str            # A+, A, B, C, D
    dimension_scores: dict
    top_strengths: list
    top_tensions: list
    clash_penalties: list
    bonuses: list


def dim_score(a: float, b: float, mode: str) -> float:
    """Score a single variable pair."""
    if mode == "similarity":
        return 1.0 - abs(a - b)
    elif mode == "complement":
        return abs(a - b)
    return 0.5


def evaluate_clash(a_scores: dict, b_scores: dict, rule: tuple, context: str) -> float:
    var_a, op_a, thresh_a, var_b, op_b, thresh_b, contexts, penalty = rule

    if context not in contexts:
        return 0.0

    val_a = a_scores.get(var_a, 0.5)

    # Gap rule (single variable, just measures distance between A and B)
    if op_a == "gap":
        val_b = b_scores.get(var_a, 0.5)
        if abs(val_a - val_b) >= thresh_a:
            return penalty
        return 0.0

    # Two-variable rule
    val_b = b_scores.get(var_b, 0.5)

    a_triggered = (val_a > thresh_a) if op_a == ">" else (val_a < thresh_a)
    b_triggered = (val_b > thresh_b) if op_b == ">" else (val_b < thresh_b)

    if a_triggered and b_triggered:
        return penalty
    return 0.0


def evaluate_bonus(a_scores: dict, b_scores: dict, rule: tuple, context: str) -> float:
    var_a, op_a, thresh_a, var_b, op_b, thresh_b, contexts, bonus = rule

    if context not in contexts:
        return 0.0

    val_a = a_scores.get(var_a, 0.5)
    val_b = b_scores.get(var_b, 0.5)

    a_triggered = (val_a > thresh_a) if op_a == ">" else (val_a < thresh_a)
    b_triggered = (val_b > thresh_b) if op_b == ">" else (val_b < thresh_b)

    if a_triggered and b_triggered:
        return bonus
    return 0.0


def compute_match(vector_a: dict, vector_b: dict, context: str) -> MatchResult:
    assert context in ("hackathon", "romantic", "friendship"), f"Invalid context: {context}"

    a_scores = vector_a["scores"]
    b_scores = vector_b["scores"]

    # ── Per-variable weighted scores ──
    raw_scores = {}
    weights = {}
    for var, config in VARIABLE_CONFIG.items():
        w = config[context]
        s = dim_score(a_scores.get(var, 0.5), b_scores.get(var, 0.5), config["mode"])
        raw_scores[var] = s
        weights[var] = w

    # Normalize weights to sum to 1
    total_weight = sum(weights.values())
    normalized = {v: w / total_weight for v, w in weights.items()}

    # Weighted sum
    base_score = sum(raw_scores[v] * normalized[v] for v in VARIABLE_CONFIG)

    # ── Dimension rollups ──
    dimension_groups = {
        "Cognitive Style":      list(VARIABLE_CONFIG.keys())[0:9],
        "Emotional Profile":    list(VARIABLE_CONFIG.keys())[9:19],
        "Collaboration & Work": list(VARIABLE_CONFIG.keys())[19:29],
        "Values & Motivation":  list(VARIABLE_CONFIG.keys())[29:38],
        "Communication":        list(VARIABLE_CONFIG.keys())[38:45],
        "Identity & Lifestyle": list(VARIABLE_CONFIG.keys())[45:50],
    }

    dimension_scores = {}
    for dim_name, vars_ in dimension_groups.items():
        dim_w = sum(weights[v] for v in vars_)
        if dim_w == 0:
            dimension_scores[dim_name] = 0.5
        else:
            dimension_scores[dim_name] = sum(raw_scores[v] * weights[v] for v in vars_) / dim_w

    # ── Clashes ──
    clash_hits = []
    clash_total = 0.0
    for rule in CLASH_RULES:
        p = evaluate_clash(a_scores, b_scores, rule, context)
        if p != 0.0:
            clash_hits.append({"rule": rule[0], "penalty": p})
            clash_total += p

    # ── Bonuses ──
    bonus_hits = []
    bonus_total = 0.0
    for rule in BONUS_RULES:
        b = evaluate_bonus(a_scores, b_scores, rule, context)
        if b != 0.0:
            bonus_hits.append({"rule": rule[0], "bonus": b})
            bonus_total += b

    # ── Final score ──
    final = max(0.0, min(1.0, base_score + clash_total + bonus_total))

    # ── Top strengths and tensions ──
    sorted_vars = sorted(raw_scores.items(), key=lambda x: weights[x[0]] * x[1], reverse=True)
    top_strengths = [
        {"variable": v, "score": round(s, 2), "weight": round(normalized[v], 3)}
        for v, s in sorted_vars[:5]
    ]

    sorted_tensions = sorted(raw_scores.items(), key=lambda x: weights[x[0]] * x[1])
    top_tensions = [
        {"variable": v, "score": round(s, 2), "weight": round(normalized[v], 3)}
        for v, s in sorted_tensions[:5]
    ]

    # ── Grade ──
    if final >= 0.88:   grade = "A+"
    elif final >= 0.80: grade = "A"
    elif final >= 0.70: grade = "B"
    elif final >= 0.60: grade = "C"
    else:               grade = "D"

    return MatchResult(
        score=round(final, 4),
        grade=grade,
        dimension_scores={k: round(v, 3) for k, v in dimension_scores.items()},
        top_strengths=top_strengths,
        top_tensions=top_tensions,
        clash_penalties=clash_hits,
        bonuses=bonus_hits,
    )


# ── 3. PRETTY PRINT ───────────────────────────────────────────────────────────

def print_result(result: MatchResult, context: str):
    print(f"\n{'═'*52}")
    print(f"  COMPATIBILITY SCORE  [{context.upper()}]")
    print(f"{'═'*52}")
    print(f"  {result.score:.2%}   Grade: {result.grade}")
    print(f"{'─'*52}")

    print("\n  DIMENSION BREAKDOWN")
    for dim, score in result.dimension_scores.items():
        bar = "█" * int(score * 20) + "░" * (20 - int(score * 20))
        print(f"  {dim:<22} {bar} {score:.2f}")

    print("\n  TOP STRENGTHS")
    for s in result.top_strengths:
        print(f"  ✓ {s['variable']:<30} {s['score']:.2f}")

    print("\n  TOP TENSIONS")
    for t in result.top_tensions:
        print(f"  ✗ {t['variable']:<30} {t['score']:.2f}")

    if result.clash_penalties:
        print("\n  CLASH PENALTIES")
        for c in result.clash_penalties:
            print(f"  ⚠ {c['rule']:<30} {c['penalty']:+.2f}")

    if result.bonuses:
        print("\n  BONUSES")
        for b in result.bonuses:
            print(f"  ★ {b['rule']:<30} {b['bonus']:+.2f}")

    print(f"\n{'═'*52}\n")


def result_to_dict(result: MatchResult) -> dict:
    return {
        "score": result.score,
        "grade": result.grade,
        "dimension_scores": result.dimension_scores,
        "top_strengths": result.top_strengths,
        "top_tensions": result.top_tensions,
        "clash_penalties": result.clash_penalties,
        "bonuses": result.bonuses,
    }


# ── 4. CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Match two personality vectors")
    parser.add_argument("--a",       required=True, help="Path to vector A JSON")
    parser.add_argument("--b",       required=True, help="Path to vector B JSON")
    parser.add_argument("--context", required=True, choices=["hackathon", "romantic", "friendship"])
    parser.add_argument("--output",  default=None,  help="Optional path to save result JSON")
    args = parser.parse_args()

    with open(args.a) as f: vector_a = json.load(f)
    with open(args.b) as f: vector_b = json.load(f)

    result = compute_match(vector_a, vector_b, args.context)
    print_result(result, args.context)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(result_to_dict(result), f, indent=2)
        print(f"Saved to {args.output}")