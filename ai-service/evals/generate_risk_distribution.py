"""Generate clean, publication-grade horizontal bar chart showing the distribution
of observations across the 4 risk levels (LOW, MEDIUM, HIGH, CRITICAL).

Matches exactly the numbers and color scheme of the anomaly score histogram
(Figure 5.12) to ensure 100% coherence across the report.
"""
from __future__ import annotations

from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = PROJECT_ROOT / "repartition_risques_anomalies.png"

# Data from calibrated Isolation Forest on 10,000 synthetic attendance records
categories = [
    "Faible (LOW)",
    "Moyen (MEDIUM)",
    "Élevé (HIGH)",
    "Critique (CRITICAL)",
]
counts = [7500, 1500, 700, 300]
total = sum(counts)
percentages = [c / total * 100 for c in counts]

# Colors matching Figure 5.12 (histogram)
colors = [
    "#0891b2",  # Teal / Bleu - Faible
    "#ca8a04",  # Jaune / Ambre - Moyen
    "#ea580c",  # Orange - Élevé
    "#dc2626",  # Rouge - Critique
]

# Matplotlib configuration (clean academic / Colab white style)
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Inter", "Segoe UI", "DejaVu Sans", "Helvetica Neue", "Arial"],
    "font.size": 11,
    "axes.titlesize": 13,
    "axes.labelsize": 11,
})

fig, ax = plt.subplots(figsize=(9, 4.8), dpi=200)

BG = "#ffffff"
TEXT = "#1a1a2e"
GRID = "#e2e8f0"

fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

# Invert so LOW is at the top or bottom as desired.
# Usually LOW -> CRITICAL from top to bottom or bottom to top.
# In user's figure:
# Bottom: Critique (CRITICAL)
# Middle-low: Élevé (HIGH)
# Middle-top: Moyen (MEDIUM)
# Top: Faible (LOW)
y_pos = list(range(len(categories)))

bars = ax.barh(
    y_pos,
    counts,
    height=0.55,
    color=colors,
    edgecolor="none",
    zorder=3,
)

# Value annotations at the end of each bar
for i, (bar, count, pct) in enumerate(zip(bars, counts, percentages)):
    width = bar.get_width()
    label = f"{count:,} ({pct:.1f} %)".replace(",", " ")
    ax.text(
        width + 120,
        bar.get_y() + bar.get_height() / 2,
        label,
        va="center",
        ha="left",
        fontsize=10.5,
        fontweight="bold",
        color=colors[i],
    )

ax.set_yticks(y_pos)
ax.set_yticklabels(categories, fontsize=11, fontweight="medium", color=TEXT)
ax.invert_yaxis()
ax.set_xlabel("Nombre d'observations (pointages)", fontsize=11, color=TEXT, labelpad=8)
ax.set_title(
    "Répartition des observations selon le niveau de risque\n(10 000 pointages analysés)",
    fontsize=13,
    fontweight="bold",
    color=TEXT,
    pad=15,
)

# Axis limits and grid
ax.set_xlim(0, 8800)
ax.grid(axis="x", color=GRID, linestyle="--", linewidth=0.8, alpha=0.8, zorder=1)

# Spines styling
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_color("#94a3b8")
ax.spines["bottom"].set_color("#94a3b8")
ax.tick_params(colors=TEXT, which="both")

plt.tight_layout()
plt.savefig(OUT_PATH, dpi=250, facecolor=BG, bbox_inches="tight")
print(f"[OK] Figure generated successfully: {OUT_PATH}")
