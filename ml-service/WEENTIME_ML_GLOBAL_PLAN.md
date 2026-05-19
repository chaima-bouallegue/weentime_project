# WeenTime ML — Global Plan

## What shipped in this slice (ML-SERVICE-01)

* New service `ml-service/` (FastAPI on port 8001).
* Isolation Forest anomaly detection on attendance, with 15 engineered features
  matched 1:1 to `AttendanceSession`/`Presence` entities in
  `weentime-backend/services/presence-service`.
* Synthetic data generator (`generate_synthetic_attendance.py`) so the model
  trains and runs end-to-end on a fresh laptop without prod data.
* End-to-end pipeline (`train_attendance_anomaly.py`) producing a versioned
  joblib bundle the FastAPI app loads at startup.
* ai-service integration — three new tools (`rh.anomaly_dashboard`,
  `manager.anomaly_dashboard`, `rh.anomaly_employee`) registered into the
  existing `ToolRegistry`, plus intent keywords (FR/EN/Tunisian/Arabic) wired
  into `routing_priority.py`, `rh_agent.detect_intent` and
  `manager_agent.detect_intent`.
* Angular integration — `MlAnomalyService`, standalone
  `AnomalyAlertCardComponent`, and card insertions in RH/Manager/Admin
  dashboards. `mlServiceUrl` added to both environment files.
* Tests — feature engineering, model, synthetic generator, API smoke,
  schema contract between ai-service and ml-service.
* Docs — this file plus `ATTENDANCE_DATA_AUDIT.md`,
  `ML_SERVICE_ARCHITECTURE.md`, `ATTENDANCE_MODEL_DECISION.md`,
  `AI_ATTENDANCE_ANOMALY_PLAN.md`, `README.md`.

## Architecture decisions worth preserving

1. **ml-service is independent from ai-service**, mirroring the
   `BackendClient` pattern used inside ai-service for the Spring gateway. This
   makes it possible to swap the model implementation without touching the
   assistant.
2. **Feature vector order is frozen** by
   `app/features/attendance_features.FEATURE_NAMES` — the joblib bundle is
   tied to this layout. New features always append.
3. **Score normalisation uses percentiles** of `decision_function` captured at
   training time, not naive min/max, to keep the 0..1 mapping stable as
   training data evolves.
4. **Reasons come from rules**, not the model — easier for RH to understand and
   easier to extend (no retraining needed for a new reason).
5. **The synthetic generator emits the same dict shape** the
   `dataframe_to_records()` step consumes, so training and inference share the
   feature pipeline exactly.

## Known limitations

* No realtime push — dashboard polls on load. Hook into the presence
  websocket later (`ws-presence` already exists in the gateway).
* Department endpoint returns company scope (no per-dept backend endpoint).
* No false-alarm feedback loop — required before moving to a supervised model.
* JWT minting in `WeenTimeBackendClient` is unsigned-token-friendly for local
  dev but assumes the operator configured `BACKEND_JWT_SECRET` to match Spring.

## Next steps (rough priority)

1. **Realtime updates** — subscribe ml-service to `ws-presence` so dashboards
   react within seconds of a check-in/out instead of on page load.
2. **Feedback loop** — add a `POST /api/ml/anomalies/{employee_id}/feedback`
   that records "false alarm" / "confirmed" from the Angular card. Persist to
   `storage/feedback/` for later training.
3. **Per-department endpoint** — once the Spring backend exposes one, swap
   `/api/ml/anomalies/department/{id}` to call it instead of the company scope.
4. **Retraining job** — wire a daily cron in `app/workers/retrain_worker.py`
   that retrains when the previous model is > 7 days old or contamination
   drifts.
5. **More feature families** — leave overlap, telework alignment, schedule
   conformance (vs assigned `Horaire`).

## Operational runbook

* Health check: `GET http://localhost:8001/api/ml/health`
* Bootstrap a model: `POST http://localhost:8001/api/ml/train/anomaly`
* Inspect dashboard: `GET http://localhost:8001/api/ml/anomalies/dashboard`
* Logs: stdout, log level via `LOG_LEVEL` env var.
* Model files: `ml-service/storage/models/`.
* Training data: `ml-service/storage/training_data/synthetic_attendance.csv`.
