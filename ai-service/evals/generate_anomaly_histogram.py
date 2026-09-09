"""Generate anomaly-score distribution histogram from real synthetic attendance data.

Uses the 10 000-row synthetic_attendance.csv dataset.  Instead of importing
the ml-service feature pipeline (which would need PYTHONPATH hacks), we
replicate the essential feature engineering inline, train an Isolation Forest
identical to production, and produce a publication-grade histogram.
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = PROJECT_ROOT / "ml-service" / "storage" / "training_data" / "synthetic_attendance.csv"
OUT_PATH = PROJECT_ROOT / "histogramme_scores_anomalie.png"

# ---------------------------------------------------------------------------
# Feature vector (must match ml-service FEATURE_NAMES)
# ---------------------------------------------------------------------------
FEATURE_NAMES = (
    "arrival_hour", "departure_hour", "worked_hours", "late_minutes",
    "weekday", "is_weekend", "missing_checkout", "remote_flag",
    "weekly_hours", "avg_checkin_hour_30d", "deviation_from_usual",
    "behavior_delta_weekly", "night_activity", "rapid_session",
    "overtime_excess", "has_checkin", "has_checkout", "is_absent",
    "is_late", "is_remote", "is_working",
)

# ---------------------------------------------------------------------------
# 1. Load & engineer features from raw CSV
# ---------------------------------------------------------------------------
print(f"Loading {CSV_PATH} ...")
df = pd.read_csv(CSV_PATH)
print(f"  -> {len(df)} rows loaded")

# Parse datetimes
df["check_in_dt"] = pd.to_datetime(df["check_in"], errors="coerce")
df["check_out_dt"] = pd.to_datetime(df["check_out"], errors="coerce")
df["date_dt"] = pd.to_datetime(df["date"], errors="coerce")

# --- Derive all 21 features ---
df["arrival_hour"] = df["check_in_dt"].dt.hour + df["check_in_dt"].dt.minute / 60.0
df["arrival_hour"] = df["arrival_hour"].fillna(0.0)

df["departure_hour"] = df["check_out_dt"].dt.hour + df["check_out_dt"].dt.minute / 60.0
df["departure_hour"] = df["departure_hour"].fillna(0.0)

df["worked_hours"] = df["duration_seconds"].fillna(0).astype(float) / 3600.0

# Late minutes: minutes after 09:10 threshold
LATE_THRESHOLD = 9 + 10 / 60.0
df["late_minutes"] = df["arrival_hour"].apply(
    lambda h: max(0.0, (h - LATE_THRESHOLD) * 60) if h > 0 else 0.0
)

df["weekday"] = df["date_dt"].dt.weekday.fillna(0).astype(int)
df["is_weekend"] = (df["weekday"] >= 5).astype(int)

df["missing_checkout"] = (
    df["check_in_dt"].notna() & df["check_out_dt"].isna()
).astype(int)

status_upper = df["daily_status"].fillna("").str.upper()
df["remote_flag"] = (status_upper == "REMOTE").astype(int)

# Weekly hours: approximate with worked_hours * 5
df["weekly_hours"] = df["worked_hours"] * 5
df["weekly_hours"] = df["weekly_hours"].clip(0, 80)

# avg_checkin_hour_30d: use per-employee rolling mean (approximation)
df["avg_checkin_hour_30d"] = (
    df.groupby("employee_id")["arrival_hour"]
    .transform(lambda s: s.expanding().mean().fillna(9.0))
)

df["deviation_from_usual"] = (df["arrival_hour"] - df["avg_checkin_hour_30d"]).abs()
df.loc[df["arrival_hour"] == 0, "deviation_from_usual"] = 0.0

# behavior_delta_weekly: approximate (current week hours - rolling avg)
df["behavior_delta_weekly"] = (
    df.groupby("employee_id")["worked_hours"]
    .transform(lambda s: (s - s.expanding().mean()) * 5)
).fillna(0.0)

df["night_activity"] = (
    (df["arrival_hour"] > 0) & ((df["arrival_hour"] < 6) | (df["arrival_hour"] > 22))
).astype(int)

df["rapid_session"] = (
    (df["worked_hours"] > 0) & (df["worked_hours"] < 0.5) & (df["missing_checkout"] == 0)
).astype(int)

df["overtime_excess"] = (df["worked_hours"] > 10).astype(int)

df["has_checkin"] = df["check_in_dt"].notna().astype(int)
df["has_checkout"] = df["check_out_dt"].notna().astype(int)
df["is_absent"] = (
    status_upper.isin(["ABSENT", "ON_LEAVE", "CONGE", "LEAVE"]) | df["check_in_dt"].isna()
).astype(int)
df["is_late"] = (df["late_arrival"].fillna(False).astype(bool) | (df["late_minutes"] > 0)).astype(int)
df["is_remote"] = df["remote_flag"]
df["is_working"] = (
    (df["has_checkin"] == 1) & (df["is_absent"] == 0) &
    status_upper.isin(["WORKING", "PRESENT", ""])
).astype(int)

# Build feature matrix
X = df[list(FEATURE_NAMES)].fillna(0).astype(float).to_numpy()
labels = df["anomaly_injected"].astype(bool).to_numpy()
print(f"  -> Feature matrix: {X.shape}, anomalies injected: {labels.sum()}")

# ---------------------------------------------------------------------------
# 2. Train Isolation Forest (matching production config)
# ---------------------------------------------------------------------------
print("Training Isolation Forest ...")
scaler = StandardScaler().fit(X)
X_scaled = scaler.transform(X)

model = IsolationForest(
    n_estimators=200,
    contamination=0.05,
    random_state=42,
    n_jobs=-1,
)
model.fit(X_scaled)

# ---------------------------------------------------------------------------
# 3. Compute normalised anomaly scores (0 = normal, 1 = most anomalous)
# ---------------------------------------------------------------------------
raw_scores = model.decision_function(X_scaled)
score_min = float(np.percentile(raw_scores, 1))
score_max = float(np.percentile(raw_scores, 99))
normalised = np.clip((score_max - raw_scores) / (score_max - score_min), 0, 1)

# Risk bands (production calibration)
medium_thr = float(np.percentile(normalised, 75))
high_thr = float(np.percentile(normalised, 90))
critical_thr = float(np.percentile(normalised, 97))
medium_thr = max(0.20, min(medium_thr, 0.75))
high_thr = max(medium_thr + 0.05, min(high_thr, 0.90))
critical_thr = max(high_thr + 0.03, min(critical_thr, 0.98))

print(f"  -> Thresholds  LOW < {medium_thr:.2f} < MEDIUM < {high_thr:.2f} < HIGH < {critical_thr:.2f} < CRITICAL")
print(f"  -> Score range [{normalised.min():.3f}, {normalised.max():.3f}], mean={normalised.mean():.3f}")

# ---------------------------------------------------------------------------
# 4. Plot histogram (white / Colab style)
# ---------------------------------------------------------------------------
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Inter", "Segoe UI", "Helvetica Neue", "Arial"],
    "font.size": 11,
    "axes.titlesize": 14,
    "axes.labelsize": 12,
})

fig, ax = plt.subplots(figsize=(10, 5.5))

BG = "#ffffff"
TEXT = "#1a1a2e"
GRID = "#d1d5db"

fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

# Histogram bins
bins = np.linspace(0, 1, 51)
bin_centers = 0.5 * (bins[:-1] + bins[1:])

counts, _ = np.histogram(normalised, bins=bins)

# Colour each bin by risk band
colors = []
for c in bin_centers:
    if c >= critical_thr:
        colors.append("#dc2626")    # rouge - CRITICAL
    elif c >= high_thr:
        colors.append("#ea580c")    # orange - HIGH
    elif c >= medium_thr:
        colors.append("#ca8a04")    # jaune - MEDIUM
    else:
        colors.append("#0891b2")    # teal - LOW

ax.bar(bin_centers, counts, width=(bins[1] - bins[0]) * 0.92,
       color=colors, edgecolor="white", linewidth=0.5, zorder=3)

# Threshold vertical lines
for thr, label, col, ls in [
    (medium_thr, f"Moyen ({medium_thr:.2f})", "#ca8a04", "--"),
    (high_thr,   f"Eleve ({high_thr:.2f})",   "#ea580c", "--"),
    (critical_thr, f"Critique ({critical_thr:.2f})", "#dc2626", "--"),
]:
    ax.axvline(thr, color=col, linestyle=ls, linewidth=1.5, alpha=0.85, zorder=4)
    ax.text(thr + 0.012, ax.get_ylim()[1] * 0.01, label,
            color=col, fontsize=8.5, fontweight="bold", rotation=90,
            va="bottom", ha="left", zorder=5)

# Labels & styling
ax.set_xlabel("Score d'anomalie (0 = normal, 1 = critique)", color=TEXT, fontsize=12)
ax.set_ylabel("Nombre d'enregistrements", color=TEXT, fontsize=12)
ax.set_title("Distribution des scores d'anomalie -- Isolation Forest\n"
             f"(n = {len(normalised):,} pointages, contamination = 5 %)",
             color=TEXT, fontweight="bold", fontsize=13, pad=12)

ax.tick_params(colors=TEXT, which="both")
for spine in ax.spines.values():
    spine.set_color(GRID)
ax.grid(axis="y", color=GRID, alpha=0.5, linewidth=0.5, zorder=1)

# Legend
from matplotlib.patches import Patch
legend_items = [
    Patch(facecolor="#0891b2", label="Faible"),
    Patch(facecolor="#ca8a04", label="Moyen"),
    Patch(facecolor="#ea580c", label="Eleve"),
    Patch(facecolor="#dc2626", label="Critique"),
]
leg = ax.legend(handles=legend_items, loc="upper right", fontsize=9,
                facecolor=BG, edgecolor=GRID, labelcolor=TEXT,
                title="Niveau de risque", title_fontsize=10)
leg.get_title().set_color(TEXT)

# Stats annotation
n_low = int((normalised < medium_thr).sum())
n_med = int(((normalised >= medium_thr) & (normalised < high_thr)).sum())
n_high = int(((normalised >= high_thr) & (normalised < critical_thr)).sum())
n_crit = int((normalised >= critical_thr).sum())
stats_text = (
    f"Faible: {n_low:,} ({100*n_low/len(normalised):.1f} %)\n"
    f"Moyen: {n_med:,} ({100*n_med/len(normalised):.1f} %)\n"
    f"Eleve: {n_high:,} ({100*n_high/len(normalised):.1f} %)\n"
    f"Critique: {n_crit:,} ({100*n_crit/len(normalised):.1f} %)"
)
ax.text(0.98, 0.72, stats_text, transform=ax.transAxes,
        fontsize=8.5, color=TEXT, va="top", ha="right",
        fontfamily="monospace",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#f8fafc", edgecolor=GRID, alpha=0.9))

plt.tight_layout()
plt.savefig(OUT_PATH, dpi=200, facecolor=BG, bbox_inches="tight")
print(f"\n[OK] Histogram saved -> {OUT_PATH}")
