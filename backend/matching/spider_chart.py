"""
Spider Chart Visualizer
Renders single self-portrait or overlaid dual comparison chart.

Usage:
    # Self-portrait
    python3 spider_chart.py --a my_vector.json

    # Comparison (overlaid)
    python3 spider_chart.py --a my_vector.json --b their_vector.json --context hackathon
"""

import json
import argparse
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import math

# ── DIMENSION GROUPS (6 axes on the spider chart) ────────────────────────────

DIMENSIONS = {
    "Cognitive\nStyle": [
        "abstract_thinking", "systems_thinking", "novelty_seeking",
        "detail_orientation", "decisiveness", "pattern_recognition",
        "risk_tolerance", "contrarianism", "depth_vs_breadth"
    ],
    "Emotional\nProfile": [
        "emotional_expressiveness", "hotheadedness", "empathy_signaling",
        "self_criticism", "confidence_oscillation", "optimism",
        "vulnerability", "emotional_neediness", "intensity", "frustration_tolerance"
    ],
    "Collaboration\n& Work": [
        "leadership_drive", "structure_need", "feedback_receptivity",
        "execution_bias", "async_preference", "ownership_taking",
        "perfectionism", "collaboration_enjoyment", "adaptability", "deadline_orientation"
    ],
    "Values &\nMotivation": [
        "intrinsic_motivation", "impact_orientation", "ambition",
        "ethical_sensitivity", "competitiveness", "loyalty",
        "independence_value", "intellectual_humility", "long_term_thinking"
    ],
    "Communication": [
        "directness", "verbosity", "humor_frequency", "humor_style",
        "question_asking_rate", "formality", "storytelling_tendency"
    ],
    "Identity &\nLifestyle": [
        "social_energy", "routine_vs_spontaneity", "creative_drive",
        "physical_lifestyle", "life_pace"
    ],
}

DIM_LABELS = list(DIMENSIONS.keys())
N = len(DIM_LABELS)  # 6 axes


def get_dimension_scores(vector: dict) -> list[float]:
    """Average the variable scores within each dimension."""
    scores_raw = vector["scores"]
    result = []
    for dim, variables in DIMENSIONS.items():
        vals = [scores_raw.get(v, 0.5) for v in variables]
        result.append(sum(vals) / len(vals))
    return result


# ── COLORS ────────────────────────────────────────────────────────────────────

COLOR_A = "#7C5CBF"       # Purple — user A
COLOR_B = "#E8665A"       # Coral — user B
COLOR_BG = "#0F0F1A"      # Dark background
COLOR_GRID = "#2A2A3F"    # Subtle grid
COLOR_TEXT = "#E8E8F0"    # Light text
COLOR_ACCENT = "#C8B8FF"  # Light purple accent


# ── SELF-PORTRAIT ─────────────────────────────────────────────────────────────

def draw_self_portrait(vector: dict, name: str = "You", output_path: str = "self_portrait.png"):
    scores = get_dimension_scores(vector)
    confidence = vector.get("confidence", "medium")
    msg_count = vector.get("message_count_used", "?")

    # Close the radar loop
    values = scores + [scores[0]]
    angles = [n / float(N) * 2 * math.pi for n in range(N)]
    angles += angles[:1]

    fig = plt.figure(figsize=(10, 10), facecolor=COLOR_BG)
    ax = fig.add_subplot(111, polar=True, facecolor=COLOR_BG)

    # Grid rings
    for r in [0.2, 0.4, 0.6, 0.8, 1.0]:
        ax.plot(angles, [r] * len(angles), color=COLOR_GRID, linewidth=0.8, linestyle="--", alpha=0.5)
        if r < 1.0:
            ax.text(0, r, f"{r:.1f}", color=COLOR_GRID, fontsize=7, ha="center", va="center")

    # Axis lines
    for angle in angles[:-1]:
        ax.plot([angle, angle], [0, 1], color=COLOR_GRID, linewidth=0.8, alpha=0.4)

    # Fill
    ax.fill(angles, values, color=COLOR_A, alpha=0.25)
    ax.plot(angles, values, color=COLOR_A, linewidth=2.5, linestyle="solid")

    # Data points
    for angle, val in zip(angles[:-1], scores):
        ax.plot(angle, val, "o", color=COLOR_A, markersize=8, zorder=5)
        ax.plot(angle, val, "o", color=COLOR_BG, markersize=4, zorder=6)

    # Labels
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(
        DIM_LABELS,
        color=COLOR_TEXT,
        fontsize=11,
        fontweight="bold",
        fontfamily="monospace"
    )
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.spines["polar"].set_visible(False)

    # Title block
    fig.text(0.5, 0.97, f"YOUR MIRROR", ha="center", va="top",
             color=COLOR_ACCENT, fontsize=13, fontweight="bold",
             fontfamily="monospace", alpha=0.8)
    fig.text(0.5, 0.93, name, ha="center", va="top",
             color=COLOR_TEXT, fontsize=22, fontweight="bold")
    fig.text(0.5, 0.89, f"Based on {msg_count} messages  ·  Confidence: {confidence.upper()}",
             ha="center", va="top", color=COLOR_GRID, fontsize=9, fontfamily="monospace")

    # Score cards at bottom
    raw_scores = vector["scores"]
    highlights = [
        ("HIGHEST", max(raw_scores, key=raw_scores.get), max(raw_scores.values())),
        ("LOWEST",  min(raw_scores, key=raw_scores.get), min(raw_scores.values())),
    ]
    for i, (label, var, val) in enumerate(highlights):
        x = 0.28 + i * 0.44
        fig.text(x, 0.06, label, ha="center", color=COLOR_ACCENT,
                 fontsize=8, fontfamily="monospace", fontweight="bold")
        fig.text(x, 0.035, var.replace("_", " ").title(), ha="center",
                 color=COLOR_TEXT, fontsize=10, fontweight="bold")
        fig.text(x, 0.01, f"{val:.2f}", ha="center",
                 color=COLOR_A, fontsize=14, fontweight="bold", fontfamily="monospace")

    plt.tight_layout(rect=[0, 0.08, 1, 0.88])
    plt.savefig(output_path, dpi=180, bbox_inches="tight", facecolor=COLOR_BG)
    print(f"Self-portrait saved → {output_path}")
    plt.show()


# ── DUAL COMPARISON ───────────────────────────────────────────────────────────

def draw_comparison(vector_a: dict, vector_b: dict,
                    name_a: str = "You", name_b: str = "Them",
                    context: str = "hackathon",
                    score: float = None,
                    output_path: str = "comparison.png"):

    scores_a = get_dimension_scores(vector_a)
    scores_b = get_dimension_scores(vector_b)

    values_a = scores_a + [scores_a[0]]
    values_b = scores_b + [scores_b[0]]
    angles = [n / float(N) * 2 * math.pi for n in range(N)]
    angles += angles[:1]

    fig = plt.figure(figsize=(11, 10), facecolor=COLOR_BG)
    ax = fig.add_subplot(111, polar=True, facecolor=COLOR_BG)

    # Grid
    for r in [0.2, 0.4, 0.6, 0.8, 1.0]:
        ax.plot(angles, [r] * len(angles), color=COLOR_GRID, linewidth=0.8, linestyle="--", alpha=0.5)

    for angle in angles[:-1]:
        ax.plot([angle, angle], [0, 1], color=COLOR_GRID, linewidth=0.8, alpha=0.4)

    # Fill both
    ax.fill(angles, values_a, color=COLOR_A, alpha=0.20)
    ax.fill(angles, values_b, color=COLOR_B, alpha=0.20)

    # Overlap fill — highlight the intersection
    overlap = [min(a, b) for a, b in zip(values_a, values_b)]
    ax.fill(angles, overlap, color="#FFFFFF", alpha=0.08)

    # Lines
    ax.plot(angles, values_a, color=COLOR_A, linewidth=2.5)
    ax.plot(angles, values_b, color=COLOR_B, linewidth=2.5)

    # Points
    for angle, val in zip(angles[:-1], scores_a):
        ax.plot(angle, val, "o", color=COLOR_A, markersize=7, zorder=5)

    for angle, val in zip(angles[:-1], scores_b):
        ax.plot(angle, val, "o", color=COLOR_B, markersize=7, zorder=5)

    # Labels
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(DIM_LABELS, color=COLOR_TEXT, fontsize=11,
                       fontweight="bold", fontfamily="monospace")
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.spines["polar"].set_visible(False)

    # Header
    context_label = context.upper()
    fig.text(0.5, 0.97, f"COMPATIBILITY  ·  {context_label}", ha="center", va="top",
             color=COLOR_ACCENT, fontsize=12, fontweight="bold", fontfamily="monospace")

    if score is not None:
        fig.text(0.5, 0.93, f"{score:.0%}", ha="center", va="top",
                 color=COLOR_TEXT, fontsize=28, fontweight="bold")

    # Legend
    patch_a = mpatches.Patch(color=COLOR_A, alpha=0.7, label=name_a)
    patch_b = mpatches.Patch(color=COLOR_B, alpha=0.7, label=name_b)
    ax.legend(handles=[patch_a, patch_b], loc="upper right",
              bbox_to_anchor=(1.3, 1.1), framealpha=0,
              labelcolor=COLOR_TEXT, fontsize=11)

    # Dimension delta cards — show biggest gap and biggest overlap
    deltas = [(DIM_LABELS[i].replace("\n", " "), abs(scores_a[i] - scores_b[i])) for i in range(N)]
    most_complementary = max(deltas, key=lambda x: x[1])
    most_aligned = min(deltas, key=lambda x: x[1])

    fig.text(0.22, 0.06, "MOST COMPLEMENTARY", ha="center", color=COLOR_ACCENT,
             fontsize=8, fontfamily="monospace", fontweight="bold")
    fig.text(0.22, 0.035, most_complementary[0], ha="center",
             color=COLOR_TEXT, fontsize=10, fontweight="bold")
    fig.text(0.22, 0.01, f"Δ {most_complementary[1]:.2f}", ha="center",
             color=COLOR_B, fontsize=13, fontweight="bold", fontfamily="monospace")

    fig.text(0.78, 0.06, "MOST ALIGNED", ha="center", color=COLOR_ACCENT,
             fontsize=8, fontfamily="monospace", fontweight="bold")
    fig.text(0.78, 0.035, most_aligned[0], ha="center",
             color=COLOR_TEXT, fontsize=10, fontweight="bold")
    fig.text(0.78, 0.01, f"Δ {most_aligned[1]:.2f}", ha="center",
             color=COLOR_A, fontsize=13, fontweight="bold", fontfamily="monospace")

    plt.tight_layout(rect=[0, 0.08, 1, 0.88])
    plt.savefig(output_path, dpi=180, bbox_inches="tight", facecolor=COLOR_BG)
    print(f"Comparison chart saved → {output_path}")
    plt.show()


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--a",       required=True)
    parser.add_argument("--b",       default=None)
    parser.add_argument("--name-a",  default="You")
    parser.add_argument("--name-b",  default="Them")
    parser.add_argument("--context", default="hackathon", choices=["hackathon", "romantic", "friendship"])
    parser.add_argument("--score",   default=None, type=float)
    parser.add_argument("--output",  default=None)
    args = parser.parse_args()

    with open(args.a) as f:
        va = json.load(f)

    if args.b:
        with open(args.b) as f:
            vb = json.load(f)
        out = args.output or "comparison.png"
        draw_comparison(va, vb, args.name_a, args.name_b, args.context, args.score, out)
    else:
        out = args.output or "self_portrait.png"
        draw_self_portrait(va, args.name_a, out)