"""
Additional Charts:
  1. Self-growth over time (two snapshots overlaid)
  2. 4-way team overlay for hackathon

Usage:
    python3 extra_charts.py --chart growth --a my_vector_old.json --b my_vector.json
    python3 extra_charts.py --chart team --members my_vector.json teammate2.json teammate3.json teammate4.json
"""

import json
import argparse
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import math

# ── SHARED CONFIG ─────────────────────────────────────────────────────────────

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
N = len(DIM_LABELS)

COLOR_BG    = "#0F0F1A"
COLOR_GRID  = "#2A2A3F"
COLOR_TEXT  = "#E8E8F0"
COLOR_ACCENT= "#C8B8FF"

# Growth chart colors
COLOR_PAST   = "#4A4A6A"   # Muted purple — old self
COLOR_NOW    = "#7C5CBF"   # Bright purple — current self
COLOR_GROWTH = "#A8FF78"   # Green — positive growth

# Team chart colors
TEAM_COLORS = ["#7C5CBF", "#E8665A", "#4ECDC4", "#FFD93D"]


def get_dim_scores(vector: dict) -> list[float]:
    raw = vector["scores"]
    return [
        sum(raw.get(v, 0.5) for v in vars_) / len(vars_)
        for vars_ in DIMENSIONS.values()
    ]


def make_radar(fig, ax, angles, values, color, alpha_fill, alpha_line, lw, label=None, zorder=3):
    ax.fill(angles, values, color=color, alpha=alpha_fill, zorder=zorder)
    ax.plot(angles, values, color=color, linewidth=lw, zorder=zorder+1, label=label)


def draw_grid(ax, angles):
    for r in [0.2, 0.4, 0.6, 0.8, 1.0]:
        ax.plot(angles, [r]*len(angles), color=COLOR_GRID, linewidth=0.7, linestyle="--", alpha=0.5)
    for angle in angles[:-1]:
        ax.plot([angle, angle], [0, 1], color=COLOR_GRID, linewidth=0.7, alpha=0.4)


# ── 1. GROWTH CHART ───────────────────────────────────────────────────────────

def draw_growth(vector_past: dict, vector_now: dict,
                label_past: str = "Jan 2024",
                label_now: str  = "Jan 2025",
                output_path: str = "growth.png"):

    scores_past = get_dim_scores(vector_past)
    scores_now  = get_dim_scores(vector_now)
    deltas      = [n - p for p, n in zip(scores_past, scores_now)]

    vals_past = scores_past + [scores_past[0]]
    vals_now  = scores_now  + [scores_now[0]]
    angles    = [n / float(N) * 2 * math.pi for n in range(N)] + \
                [0 / float(N) * 2 * math.pi]

    fig = plt.figure(figsize=(12, 11), facecolor=COLOR_BG)
    ax  = fig.add_subplot(111, polar=True, facecolor=COLOR_BG)

    draw_grid(ax, angles)

    # Past — muted
    make_radar(fig, ax, angles, vals_past, COLOR_PAST, 0.15, 0.6, 1.8, label_past, zorder=3)

    # Now — bright
    make_radar(fig, ax, angles, vals_now,  COLOR_NOW,  0.25, 0.9, 2.8, label_now,  zorder=4)

    # Growth arrows on each axis
    for i, (angle, delta) in enumerate(zip(angles[:-1], deltas)):
        base  = scores_past[i]
        tip   = scores_now[i]
        color = COLOR_GROWTH if delta > 0.05 else ("#FF6B6B" if delta < -0.05 else COLOR_GRID)
        if abs(delta) > 0.04:
            ax.annotate(
                "",
                xy=(angle, tip),
                xytext=(angle, base),
                arrowprops=dict(
                    arrowstyle="->" if delta > 0 else "<-",
                    color=color,
                    lw=2.0,
                    connectionstyle="arc3,rad=0"
                ),
                zorder=6
            )

    # Data points — now
    for angle, val in zip(angles[:-1], scores_now):
        ax.plot(angle, val, "o", color=COLOR_NOW, markersize=8, zorder=7)
        ax.plot(angle, val, "o", color=COLOR_BG,  markersize=4, zorder=8)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(DIM_LABELS, color=COLOR_TEXT, fontsize=11,
                       fontweight="bold", fontfamily="monospace")
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.spines["polar"].set_visible(False)

    # Header
    fig.text(0.5, 0.97, "YOUR GROWTH", ha="center", va="top",
             color=COLOR_ACCENT, fontsize=13, fontweight="bold", fontfamily="monospace")
    fig.text(0.5, 0.93, f"{label_past}  →  {label_now}", ha="center", va="top",
             color=COLOR_TEXT, fontsize=18, fontweight="bold")

    # Legend
    patch_past = mpatches.Patch(color=COLOR_PAST, alpha=0.7, label=label_past)
    patch_now  = mpatches.Patch(color=COLOR_NOW,  alpha=0.9, label=label_now)
    ax.legend(handles=[patch_past, patch_now], loc="upper right",
              bbox_to_anchor=(1.35, 1.1), framealpha=0,
              labelcolor=COLOR_TEXT, fontsize=11)

    # Delta cards — biggest growth, biggest regression
    dim_names = [d.replace("\n", " ") for d in DIM_LABELS]
    biggest_growth = max(zip(dim_names, deltas), key=lambda x: x[1])
    biggest_drop   = min(zip(dim_names, deltas), key=lambda x: x[1])

    for x_pos, (dim, delta), color, label in [
        (0.22, biggest_growth, COLOR_GROWTH, "BIGGEST GROWTH"),
        (0.78, biggest_drop,   "#FF6B6B",    "NEEDS WORK"),
    ]:
        fig.text(x_pos, 0.06,  label,                  ha="center", color=COLOR_ACCENT,
                 fontsize=8, fontfamily="monospace", fontweight="bold")
        fig.text(x_pos, 0.035, dim,                    ha="center", color=COLOR_TEXT,
                 fontsize=10, fontweight="bold")
        fig.text(x_pos, 0.01,  f"{delta:+.2f}",        ha="center", color=color,
                 fontsize=14, fontweight="bold", fontfamily="monospace")

    plt.tight_layout(rect=[0, 0.08, 1, 0.88])
    plt.savefig(output_path, dpi=180, bbox_inches="tight", facecolor=COLOR_BG)
    print(f"Growth chart saved → {output_path}")
    plt.show()


# ── 2. 4-WAY TEAM OVERLAY ────────────────────────────────────────────────────

def draw_team(vectors: list[dict], names: list[str], output_path: str = "team.png"):
    assert len(vectors) == 4 and len(names) == 4

    all_scores = [get_dim_scores(v) for v in vectors]
    angles = [n / float(N) * 2 * math.pi for n in range(N)] + [0]

    fig = plt.figure(figsize=(13, 12), facecolor=COLOR_BG)
    ax  = fig.add_subplot(111, polar=True, facecolor=COLOR_BG)

    draw_grid(ax, angles)

    # Draw each member
    for i, (scores, color, name) in enumerate(zip(all_scores, TEAM_COLORS, names)):
        vals = scores + [scores[0]]
        make_radar(fig, ax, angles, vals, color, 0.12, 0.85, 2.2, name, zorder=3+i)
        for angle, val in zip(angles[:-1], scores):
            ax.plot(angle, val, "o", color=color, markersize=7, zorder=10)
            ax.plot(angle, val, "o", color=COLOR_BG, markersize=3, zorder=11)

    # Team average
    avg_scores = [sum(s[i] for s in all_scores) / 4 for i in range(N)]
    avg_vals   = avg_scores + [avg_scores[0]]
    ax.plot(angles, avg_vals, color="#FFFFFF", linewidth=1.2,
            linestyle="--", alpha=0.35, zorder=2)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(DIM_LABELS, color=COLOR_TEXT, fontsize=11,
                       fontweight="bold", fontfamily="monospace")
    ax.set_yticklabels([])
    ax.set_ylim(0, 1)
    ax.spines["polar"].set_visible(False)

    # Header
    fig.text(0.5, 0.97, "TEAM PROFILE", ha="center", va="top",
             color=COLOR_ACCENT, fontsize=13, fontweight="bold", fontfamily="monospace")
    fig.text(0.5, 0.93, "  ·  ".join(names), ha="center", va="top",
             color=COLOR_TEXT, fontsize=16, fontweight="bold")

    # Legend
    patches = [mpatches.Patch(color=c, alpha=0.8, label=n)
               for c, n in zip(TEAM_COLORS, names)]
    patches.append(mpatches.Patch(color="#FFFFFF", alpha=0.35, label="Team avg"))
    ax.legend(handles=patches, loc="upper right",
              bbox_to_anchor=(1.4, 1.12), framealpha=0,
              labelcolor=COLOR_TEXT, fontsize=10)

    # Coverage analysis — find weakest and strongest dimensions across the team
    dim_names = [d.replace("\n", " ") for d in DIM_LABELS]
    dim_avgs  = list(zip(dim_names, avg_scores))
    strongest = max(dim_avgs, key=lambda x: x[1])
    weakest   = min(dim_avgs, key=lambda x: x[1])

    # Coverage spread — low std dev = everyone similar, high = good diversity
    stds = [np.std([all_scores[m][i] for m in range(4)]) for i in range(N)]
    most_diverse = dim_names[int(np.argmax(stds))]
    most_uniform = dim_names[int(np.argmin(stds))]

    cards = [
        (0.15, "TEAM STRENGTH",  strongest[0],   f"{strongest[1]:.2f}", TEAM_COLORS[0]),
        (0.38, "COVERAGE GAP",   weakest[0],     f"{weakest[1]:.2f}",   "#FF6B6B"),
        (0.62, "MOST DIVERSE",   most_diverse,   "↕ high spread",       TEAM_COLORS[2]),
        (0.85, "MOST ALIGNED",   most_uniform,   "↔ low spread",        TEAM_COLORS[3]),
    ]

    for x_pos, label, dim, val, color in cards:
        fig.text(x_pos, 0.06,  label, ha="center", color=COLOR_ACCENT,
                 fontsize=7, fontfamily="monospace", fontweight="bold")
        fig.text(x_pos, 0.035, dim,   ha="center", color=COLOR_TEXT,
                 fontsize=9, fontweight="bold")
        fig.text(x_pos, 0.01,  val,   ha="center", color=color,
                 fontsize=12, fontweight="bold", fontfamily="monospace")

    plt.tight_layout(rect=[0, 0.08, 1, 0.88])
    plt.savefig(output_path, dpi=180, bbox_inches="tight", facecolor=COLOR_BG)
    print(f"Team chart saved → {output_path}")
    plt.show()


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="chart")

    g = sub.add_parser("growth")
    g.add_argument("--past",       required=True)
    g.add_argument("--now",        required=True)
    g.add_argument("--label-past", default="Jan 2024")
    g.add_argument("--label-now",  default="Jan 2025")
    g.add_argument("--output",     default="growth.png")

    t = sub.add_parser("team")
    t.add_argument("--members", required=True, nargs=4, metavar="VECTOR")
    t.add_argument("--names",   nargs=4, default=["Alex", "Jordan", "Sam", "Riley"])
    t.add_argument("--output",  default="team.png")

    args = parser.parse_args()

    if args.chart == "growth":
        with open(args.past) as f: vp = json.load(f)
        with open(args.now)  as f: vn = json.load(f)
        draw_growth(vp, vn, args.label_past, args.label_now, args.output)

    elif args.chart == "team":
        vectors = []
        for path in args.members:
            with open(path) as f:
                vectors.append(json.load(f))
        draw_team(vectors, args.names, args.output)