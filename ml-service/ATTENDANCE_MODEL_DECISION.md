# Model choice — Isolation Forest for attendance anomalies

## Comparison

| Model | Pros | Cons | WeenTime fit |
|---|---|---|---|
| **Isolation Forest** | Unsupervised, fast, small-data friendly, native to scikit-learn, no hyperparameter tuning beyond `contamination`, deterministic with `random_state` | Less precise on dense overlapping clusters; weaker on sequential patterns | ✅ **Primary** |
| Local Outlier Factor | Good local-density context; works well per-employee | Slow on large company-wide batches; no online learning; can't generalize across new employees | ⚠️ Backup; useful for per-employee deep-dive once a quorum of history exists |
| One-Class SVM | Sharp boundaries on linearly separable features | Sensitive to kernel/gamma tuning; slow on >10k rows; no ranking of anomalies | ❌ |
| Autoencoder (PyTorch) | Captures temporal patterns; learns nonlinear feature compositions | Needs GPU for usable training time; requires much more labelled signal than WeenTime currently has | ❌ for v1; reconsider once attendance dataset > 100k rows and a label feedback loop exists |
| Statistical rules (z-score over arrival hour) | Trivial to implement, fully explainable | No interaction modelling (rapid session + remote + low hours combo); misses subtle drift | ⚠️ Used as the *reason generator* (we hand-code thresholds) — Isolation Forest gives the global score, rules explain it |

## Why Isolation Forest

* WeenTime starts with **no labelled anomalies** — supervised approaches are off
  the table.
* Detection has to run **company-wide in ~ms per call** — Isolation Forest scoring
  is O(log n) per tree, parallelised by sklearn.
* The team needs **deterministic, reproducible scores** — fixed `random_state`
  gives that; autoencoder weight init does not without extra plumbing.
* **Explainability** for the RH dashboard comes from `generate_reasons()`, which
  inspects the feature vector against hand-coded thresholds. The IF score
  ranks; the rules explain.

## Hyperparameters

| Param | Value | Justification |
|---|---|---|
| `n_estimators` | 200 | Below 100 the score stabilises poorly; above 500 the per-call cost grows without a measurable lift on synthetic 10k. |
| `contamination` | 0.05 | Matches WeenTime ops intuition (≈5% of daily sessions look "off"). Configurable per env. |
| `random_state` | 42 | Determinism. |
| Score normalisation | percentile (1st/99th) of `decision_function` on training set | Avoids min/max sensitivity to outliers seen during training. |

## Risk-level mapping

```
score >= 0.85 → CRITICAL
score >= 0.70 → HIGH
score >= 0.50 → MEDIUM
score <  0.50 → LOW (not surfaced on the dashboard)
```

Thresholds are env-tunable so the RH team can recalibrate without retraining.

## When to revisit

Retrain triggers (`/api/ml/train/anomaly`):

* > 30 days since last training run.
* Observed contamination drifts > 2x from configured.
* RH explicitly flags a missed anomaly category (feed it into the synthetic
  generator, retrain).

Model swap triggers:

* WeenTime accumulates > 100k labelled anomalies via the dashboard's
  "false alarm" feedback (not yet built) — at that point a supervised
  XGBoost or a small autoencoder becomes viable and would likely outperform.
