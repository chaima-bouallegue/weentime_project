# WeenTime ML Service

FastAPI service hosting the **attendance anomaly detection** model
(Isolation Forest). Sits beside the existing Spring backend (`weentime-backend`,
port 8322 gateway) and the AI assistant service (`ai-service`, port 8000).

```
Frontend (Angular :4200)
      │
      ├──────► Spring backend (:8322) ──► Postgres :5433
      ├──────► ai-service   (:8000) ──► Spring backend
      └──────► ml-service   (:8001) ──► Spring backend (read attendance)
                                  └──► storage/models/*.joblib
```

## Quick start

```powershell
cd ml-service
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env

# Generate synthetic training data and a baseline model.
python -m app.training.pipelines.train_attendance_anomaly --force-synthetic

# Start the service.
uvicorn app.main:app --port 8001 --reload
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET  | `/api/ml/health` | Liveness + model state |
| GET  | `/api/ml/anomalies/today` | Today's company-wide anomalies |
| GET  | `/api/ml/anomalies/dashboard` | Alias of `/today` (stable URL for Angular) |
| GET  | `/api/ml/anomalies/employee/{id}` | Per-employee risk timeline |
| GET  | `/api/ml/anomalies/department/{id}` | Department scope (falls back to company today) |
| POST | `/api/ml/train/anomaly` | Trigger retraining (uses synthetic data if none) |

All endpoints accept `Authorization: Bearer <jwt>` forwarded from the gateway.
Without a token, the service mints a short-lived `ml-service` token signed with
the shared `BACKEND_JWT_SECRET` so the Spring presence-service still authorises
the call.

## Configuration

`.env` keys (see `.env.example`):

* `BACKEND_URL` — Spring gateway (default `http://localhost:8322`)
* `BACKEND_JWT_SECRET` — same hex secret as `jwt.secret` in
  `weentime-backend/services/presence-service/src/main/resources/application.yml`
* `DATABASE_URL` — optional direct DB access (not used by default)
* `CONTAMINATION` — expected anomaly fraction (default 0.05)
* `CRITICAL_THRESHOLD` / `HIGH_THRESHOLD` / `MEDIUM_THRESHOLD` — score → risk mapping
* `CORS_ORIGINS` — comma-separated allowlist (Angular :4200 by default)

## Documentation map

* `ATTENDANCE_DATA_AUDIT.md` — exact entity fields from `presence-service` and
  the derived feature catalog used by the model.
* `ML_SERVICE_ARCHITECTURE.md` — component responsibilities, data flow, file
  layout.
* `ATTENDANCE_MODEL_DECISION.md` — why Isolation Forest, what was rejected.
* `AI_ATTENDANCE_ANOMALY_PLAN.md` — product framing and API contract.
* `WEENTIME_ML_GLOBAL_PLAN.md` — initiative-level plan and next steps.

## Tests

```powershell
pytest tests/ -v
```
