"""Generate static PNG report charts from trained model metadata.

Usage:
    python -m app.visualization.generate_reports --model all
    python -m app.visualization.generate_reports --model isolation_forest
    python -m app.visualization.generate_reports --model forecast
    python -m app.visualization.generate_reports --model approval
    python -m app.visualization.generate_reports --model isolation_forest --entreprise-id 5
    python -m app.visualization.generate_reports --model forecast --entreprise-id 1
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parents[2] / "storage" / "models"
REPORT_DIR = Path(__file__).resolve().parents[2] / "storage" / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# ── palette (professional, colourblind-friendly) ──────────────────────────
BAR_COLORS = ["#4C72B0", "#55A868", "#C44E52", "#8172B2", "#CCB974", "#64B5CD"]
HEATMAP_CMAP = "Blues"
TEXT_COLOR = "#2C3E50"
GRID_COLOR = "#E8E8E8"


# ── helpers ───────────────────────────────────────────────────────────────

def _load_metadata(
    pattern: str,
    label: str,
    entreprise_id: int | None = None,
) -> tuple[dict[str, Any], str] | None:
    if entreprise_id is not None and "entreprise_id" in pattern:
        pattern = pattern.replace("_v*", f"_{entreprise_id}_v*")
    candidates = sorted(MODEL_DIR.glob(pattern), reverse=True)
    if not candidates:
        logger.warning("Aucun fichier metadata trouvé pour %s (pattern: %s)", label, pattern)
        return None
    path = candidates[0]
    data = json.loads(path.read_text(encoding="utf-8"))
    logger.info("  ✓ %s : %s", label, path.name)
    return data, path.name


def _version_str(metadata: dict[str, Any]) -> str:
    for key in ("model_version", "modelVersion"):
        val = metadata.get(key)
        if val:
            return str(val)
    return "unknown"


def _save_fig(fig: Any, filename: str) -> str:
    path = REPORT_DIR / filename
    fig.savefig(path, bbox_inches="tight", dpi=150, facecolor="white")
    logger.info("    → %s", path.name)
    return str(path)


# ── isolation forest ──────────────────────────────────────────────────────

def _plot_isolation_forest(metadata: dict[str, Any]) -> list[str]:
    import matplotlib.pyplot as plt
    import numpy as np

    version = _version_str(metadata)
    prefix = f"isolation_forest_{version}"
    generated: list[str] = []

    eval_metrics = metadata.get("evaluation_metrics")
    if eval_metrics is None:
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, (
            "Aucune métrique d'évaluation disponible\n"
            "(entraînement non supervisé, pas de ground truth)"
        ), ha="center", va="center", fontsize=12, color=TEXT_COLOR,
               transform=ax.transAxes)
        ax.set_title(f"Isolation Forest — {version}", fontsize=13, color=TEXT_COLOR)
        ax.axis("off")
        generated.append(_save_fig(fig, f"{prefix}_no_metrics.png"))
        plt.close(fig)
        return generated

    cm = eval_metrics.get("confusion_matrix")
    precision = eval_metrics.get("precision")
    recall = eval_metrics.get("recall")
    f1 = eval_metrics.get("f1")

    # Graphique 1 : matrice de confusion heatmap
    if cm:
        fig, ax = plt.subplots(figsize=(5.5, 5))
        arr = np.array(cm)
        im = ax.imshow(arr, cmap=HEATMAP_CMAP, vmin=0, vmax=arr.max() + 10)
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cbar.ax.tick_params(labelsize=9)
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["Normal", "Anomalie"], fontsize=10)
        ax.set_yticklabels(["Normal", "Anomalie"], fontsize=10)
        ax.set_xlabel("Prédiction", fontsize=11, color=TEXT_COLOR)
        ax.set_ylabel("Réel", fontsize=11, color=TEXT_COLOR)
        ax.set_title(f"Matrice de confusion — Isolation Forest\n{version}", fontsize=13, color=TEXT_COLOR)
        for i in range(2):
            for j in range(2):
                ax.text(j, i, str(arr[i, j]), ha="center", va="center",
                        fontsize=13, fontweight="bold",
                        color="white" if arr[i, j] > arr.max() * 0.5 else TEXT_COLOR)
        generated.append(_save_fig(fig, f"{prefix}_confusion_matrix.png"))
        plt.close(fig)

    # Graphique 2 : precision / recall / f1 bar chart
    if precision is not None and recall is not None and f1 is not None:
        fig, ax = plt.subplots(figsize=(6, 4.5))
        labels = ["Precision", "Recall", "F1-score"]
        values = [float(precision), float(recall), float(f1)]
        bars = ax.bar(labels, values, color=BAR_COLORS[:3], edgecolor="white", width=0.55)
        ax.set_ylim(0, 1.0)
        ax.set_ylabel("Score", fontsize=11, color=TEXT_COLOR)
        ax.set_title(f"Métriques d'évaluation — Isolation Forest\n{version}", fontsize=13, color=TEXT_COLOR)
        ax.axhline(y=0.5, color="gray", linestyle="--", linewidth=0.8, alpha=0.6)
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                    f"{val:.3f}", ha="center", va="bottom", fontsize=11, fontweight="bold",
                    color=TEXT_COLOR)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(axis="y", color=GRID_COLOR, linewidth=0.5)
        generated.append(_save_fig(fig, f"{prefix}_metrics.png"))
        plt.close(fig)

    return generated


# ── forecast ──────────────────────────────────────────────────────────────

def _plot_forecast(metadata: dict[str, Any]) -> list[str]:
    import matplotlib.pyplot as plt
    import numpy as np

    version = _version_str(metadata)
    prefix = f"forecast_{version}"
    generated: list[str] = []

    metrics = metadata.get("metrics", {})
    if not metrics:
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, "Aucune métrique disponible pour le modèle Forecast",
                ha="center", va="center", fontsize=12, color=TEXT_COLOR,
                transform=ax.transAxes)
        ax.set_title(f"Forecast — {version}", fontsize=13, color=TEXT_COLOR)
        ax.axis("off")
        generated.append(_save_fig(fig, f"{prefix}_no_metrics.png"))
        plt.close(fig)
        return generated

    regression = metrics.get("regression", {})
    classification = metrics.get("classification", {})

    # Graphique 3 : MAE + RMSE côte à côte (6 barres)
    regression_keys = [
        ("maeAbsences", "MAE Absences"),
        ("maeLeaves", "MAE Congés"),
        ("maePresenceRate", "MAE Taux présence"),
        ("rmseAbsences", "RMSE Absences"),
        ("rmseLeaves", "RMSE Congés"),
        ("rmsePresenceRate", "RMSE Taux présence"),
    ]
    if regression:
        fig, ax = plt.subplots(figsize=(8, 4.5))
        labels_r = [display for _, display in regression_keys]
        values_r = [float(regression.get(key, 0)) for key, _ in regression_keys]
        bars = ax.bar(labels_r, values_r, color=BAR_COLORS, edgecolor="white", width=0.6)
        ax.set_ylabel("Erreur", fontsize=11, color=TEXT_COLOR)
        ax.set_title(f"Métriques de régression — Forecast\n{version}", fontsize=13, color=TEXT_COLOR)
        for bar, val in zip(bars, values_r):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + max(values_r) * 0.02,
                    f"{val:.4f}", ha="center", va="bottom", fontsize=9, fontweight="bold",
                    color=TEXT_COLOR)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(axis="y", color=GRID_COLOR, linewidth=0.5)
        plt.setp(ax.get_xticklabels(), rotation=25, ha="right", fontsize=9)
        generated.append(_save_fig(fig, f"{prefix}_regression_metrics.png"))
        plt.close(fig)

    # Graphique 4 : matrice de confusion classification heatmap
    cm = classification.get("confusionMatrix")
    labels_cls = classification.get("labels", ["Classe 0", "Classe 1"])
    if cm:
        fig, ax = plt.subplots(figsize=(5.5, 5))
        arr = np.array(cm)
        im = ax.imshow(arr, cmap=HEATMAP_CMAP, vmin=0, vmax=arr.max() + 10)
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cbar.ax.tick_params(labelsize=9)
        ax.set_xticks(range(len(labels_cls)))
        ax.set_yticks(range(len(labels_cls)))
        ax.set_xticklabels(labels_cls, fontsize=10)
        ax.set_yticklabels(labels_cls, fontsize=10)
        ax.set_xlabel("Prédiction", fontsize=11, color=TEXT_COLOR)
        ax.set_ylabel("Réel", fontsize=11, color=TEXT_COLOR)
        ax.set_title(f"Matrice de confusion — Forecast\n{version}", fontsize=13, color=TEXT_COLOR)
        for i in range(arr.shape[0]):
            for j in range(arr.shape[1]):
                ax.text(j, i, str(arr[i, j]), ha="center", va="center",
                        fontsize=13, fontweight="bold",
                        color="white" if arr[i, j] > arr.max() * 0.5 else TEXT_COLOR)
        generated.append(_save_fig(fig, f"{prefix}_confusion_matrix.png"))
        plt.close(fig)

    # Graphique 5 : accuracy / precision / recall / f1
    acc = classification.get("accuracy")
    prec = classification.get("precisionMacro")
    rec = classification.get("recallMacro")
    f1c = classification.get("f1Macro")
    if any(v is not None for v in [acc, prec, rec, f1c]):
        fig, ax = plt.subplots(figsize=(6, 4.5))
        cls_labels = ["Accuracy", "Precision (macro)", "Recall (macro)", "F1-score (macro)"]
        cls_values = [float(v or 0) for v in [acc, prec, rec, f1c]]
        bars = ax.bar(cls_labels, cls_values, color=BAR_COLORS[:4], edgecolor="white", width=0.55)
        ax.set_ylim(0, 1.0)
        ax.set_ylabel("Score", fontsize=11, color=TEXT_COLOR)
        ax.set_title(f"Métriques de classification — Forecast\n{version}", fontsize=13, color=TEXT_COLOR)
        ax.axhline(y=0.5, color="gray", linestyle="--", linewidth=0.8, alpha=0.6)
        for bar, val in zip(bars, cls_values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                    f"{val:.3f}", ha="center", va="bottom", fontsize=11, fontweight="bold",
                    color=TEXT_COLOR)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(axis="y", color=GRID_COLOR, linewidth=0.5)
        generated.append(_save_fig(fig, f"{prefix}_classification_metrics.png"))
        plt.close(fig)

    return generated


# ── approval ──────────────────────────────────────────────────────────────

def _plot_approval(metadata: dict[str, Any]) -> list[str]:
    import matplotlib.pyplot as plt

    version = _version_str(metadata)
    prefix = f"approval_{version}"
    generated: list[str] = []

    # L'approval model ne persiste pas ses métriques dans le metadata JSON.
    # On génère une infographie informative avec les seuils de décision.
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.axis("off")
    approve_th = metadata.get("approve_threshold", 0.7)
    reject_th = metadata.get("reject_threshold", 0.35)
    info_lines = [
        f"Modèle : Approval (LogisticRegression)",
        f"Version : {version}",
        f"",
        f"Seuils de décision :",
        f"  Approuver  si probabilité ≥ {approve_th}",
        f"  Rejeter    si probabilité ≤ {reject_th}",
        f"  Réviser    si {reject_th} < probabilité < {approve_th}",
        f"",
        f"Aucune métrique d'évaluation persistée dans le metadata.",
        f"Lancer le pipeline d'entraînement avec des données",
        f"labelisées pour obtenir accuracy/precision/recall.",
    ]
    ax.text(0.5, 0.5, "\n".join(info_lines), ha="center", va="center",
            fontsize=11, color=TEXT_COLOR, transform=ax.transAxes,
            family="monospace")
    ax.set_title(f"Approval Model — {version}", fontsize=13, color=TEXT_COLOR)
    generated.append(_save_fig(fig, f"{prefix}_info.png"))
    plt.close(fig)
    return generated


# ── CLI ───────────────────────────────────────────────────────────────────

def run(model: str, entreprise_id: int | None = None) -> None:
    import matplotlib
    matplotlib.use("Agg")

    if model in ("all", "isolation_forest"):
        pattern = "model_metadata_v*.json"
        if entreprise_id is not None:
            pattern = f"model_metadata_{entreprise_id}_v*.json"
        result = _load_metadata(pattern, "Isolation Forest", entreprise_id)
        if result:
            for path in _plot_isolation_forest(result[0]):
                logger.info("  ✓ %s", path)

    if model in ("all", "forecast"):
        pattern = "forecast_absence_leave_metadata_v*.json"
        if entreprise_id is not None:
            pattern = f"forecast_absence_leave_metadata_{entreprise_id}_v*.json"
        result = _load_metadata(pattern, "Forecast")
        if result:
            for path in _plot_forecast(result[0]):
                logger.info("  ✓ %s", path)

    if model in ("all", "approval"):
        result = _load_metadata("approval_model_metadata_v*.json", "Approval")
        if result:
            for path in _plot_approval(result[0]):
                logger.info("  ✓ %s", path)

    logger.info("Rapports sauvegardés dans %s", REPORT_DIR)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Génère les rapports PNG des modèles ML")
    parser.add_argument("--model", default="all",
                        choices=["all", "isolation_forest", "forecast", "approval"],
                        help="Modèle à visualiser (défaut : all)")
    parser.add_argument("--entreprise-id", type=int, default=None,
                        help="Filtrer par entreprise (Isolation Forest et Forecast)")
    args = parser.parse_args()
    run(args.model, args.entreprise_id)
