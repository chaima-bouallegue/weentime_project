# AI Attendance Anomaly — Product Plan

## What this feature does

Surface employees whose check-in/check-out patterns *today* deviate from their
own and the company's normal behaviour, so RH and managers see at a glance who
needs follow-up before issues compound.

Concrete UX:

* **RH dashboard** card: "Anomalies de présence détectées par l'IA" — top 5
  employees by anomaly score, colour-coded by risk, with one-line reasons.
* **Manager dashboard** card: same, scoped to the manager's team.
* **Admin dashboard** card: global view across all entreprises.
* **AI assistant**: any of the three roles can ask "anomalies aujourd'hui?",
  "warini anomalies", "who is at risk today?", "show attendance anomalies",
  etc., and the assistant returns the same data in conversational form.

## API contract (stable)

```
GET /api/ml/anomalies/dashboard
  → AnomalyDashboardResponse {
      success, generated_at,
      total_anomalies, critical, high, medium, low,
      anomalies: AnomalyRecord[]
    }

AnomalyRecord {
  employee_id, employee_name, date,
  score (0..1, higher = more anomalous),
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  reasons: string[],
  explanation: string,
  features: { ...numeric feature snapshot }
}

GET /api/ml/anomalies/employee/{id}
  → EmployeeRiskResponse {
      employee_id, employee_name, current_risk, score,
      anomalies_last_30_days, trend, latest_anomaly
    }

POST /api/ml/train/anomaly
  → TrainResponse { success, model_version, records_used,
                    training_duration_seconds, contamination_observed }
```

The Pydantic shapes live in `app/schemas/anomaly_schemas.py` — changes to that
file are breaking for ai-service and Angular.

## Out of scope for v1

* **Live websocket push** — current cadence is "on dashboard load", not realtime.
  The presence-service websocket already exists; subscribing the ml-service to
  it is a natural follow-up.
* **Per-anomaly feedback loop** ("false alarm" / "confirmed") — required for a
  supervised model later; not built in v1.
* **Department-level scoping** — endpoint exists but currently returns the
  company scope (presence-service doesn't yet expose department-scoped
  presence). Wire when the backend endpoint lands.
* **Auto-retraining cron** — scaffolding exists in `app/workers/` but no jobs
  scheduled. Manual `POST /train/anomaly` for now.

## Model rationale

See `ATTENDANCE_MODEL_DECISION.md` — TL;DR Isolation Forest on 15 hand-engineered
features mapped 1:1 to fields the `AttendanceSession` entity already stores.

## How RH/managers see anomalies right now

Until a model is trained the dashboard card renders empty with
"Aucune anomalie détectée aujourd'hui." Health endpoint reports
`model_loaded: false`. The operator runs:

```powershell
curl -X POST http://localhost:8001/api/ml/train/anomaly
```

…which uses synthetic data (or persisted parquet) to bootstrap a v1 model and
hot-reloads the detector.
