# ML Service Architecture

## Component map

```
ml-service/
├── app/
│   ├── main.py                            # FastAPI app + lifespan hook
│   ├── api/v1/routes/
│   │   ├── anomaly_routes.py              # /api/ml/anomalies/*, /train
│   │   └── health_routes.py               # /api/ml/health
│   ├── core/
│   │   ├── config.py                      # Settings (env-driven)
│   │   └── database.py                    # Optional SQLAlchemy session
│   ├── features/
│   │   └── attendance_features.py         # FeatureEngineer + AttendanceRecord
│   ├── inference/
│   │   ├── anomaly_detector.py            # Detector singleton, backend bridge
│   │   └── backend_client.py              # HTTP client + JWT minter
│   ├── models/
│   │   └── isolation_forest_model.py      # IsolationForest + StandardScaler bundle
│   ├── schemas/
│   │   └── anomaly_schemas.py             # Pydantic contracts (AnomalyRecord, ...)
│   ├── training/
│   │   ├── generate_synthetic_attendance.py
│   │   └── pipelines/train_attendance_anomaly.py
│   └── workers/                           # (reserved for retraining cron)
├── storage/
│   ├── models/                            # joblib + metadata
│   └── training_data/                     # csv/parquet
└── tests/                                 # pytest suite
```

## Data flow — `/api/ml/anomalies/dashboard`

```
Angular RH dashboard
  ↓ GET /api/ml/anomalies/dashboard
ml-service.anomaly_routes
  ↓ AnomalyDetector.fetch_today_company(token)
WeenTimeBackendClient.get('/presence/company/today')
  ↓ (Bearer = caller's JWT, else minted ml-service token)
Spring gateway :8322 → presence-service :8193
  ↑ ApiResponse<TeamStatusResponse>
WeenTimeBackendClient parses members → list[AttendanceRecord]
  ↓
AnomalyDetector.analyze_today(records)
  ↓ FeatureEngineer.compute_features per row (with per-employee history)
  ↓ AttendanceAnomalyModel.predict on each feature vector
  ↓ filter score>MEDIUM, generate_reasons, sort by score
AnomalyDashboardResponse → Angular
```

## Data flow — model training (`POST /api/ml/train/anomaly`)

```
trigger_training()
  → train_pipeline()
       1. load_or_generate_data(min_training_records)
            - prefer storage/training_data/*.parquet
            - else regenerate via generate_synthetic_attendance.generate()
       2. dataframe_to_records()
       3. FeatureEngineer.compute_batch_features()
       4. AttendanceAnomalyModel.train()
            - StandardScaler.fit_transform
            - IsolationForest.fit
            - capture decision_function range for score normalization
       5. model.save() → storage/models/isolation_forest_<v>.joblib
            + model_metadata_<v>.json
  → AnomalyDetector.reload() picks up the new bundle.
```

## Persistence layout

`storage/models/isolation_forest_v<timestamp>.joblib` contains a dict with
`{model, scaler, feature_names, model_version, contamination, score_min,
score_max, thresholds}`. `AttendanceAnomalyModel.load_latest()` resolves the
newest file by `glob('isolation_forest_v*.joblib')` + sort.

## Integration points outside ml-service

| External component | Touchpoint | File |
|---|---|---|
| ai-service tools | `MLServiceClient` calls `/api/ml/anomalies/*` | `ai-service/app/tools/ml_service_client.py` |
| ai-service tools | `register_anomaly_tools` adds `rh.anomaly_dashboard`, `manager.anomaly_dashboard`, `rh.anomaly_employee` | `ai-service/app/tools/anomaly_tools.py` |
| ai-service routing | intent keywords (FR/EN/Tunisian) trigger anomaly tool | `ai-service/app/agents/routing_priority.py`, `rh_agent.py`, `manager_agent.py` |
| Angular | `MlAnomalyService` consumes `/api/ml/anomalies/dashboard` | `weentime-frontend/.../core/services/ml-anomaly.service.ts` |
| Angular | `AnomalyAlertCardComponent` rendered on RH/Manager/Admin dashboards | `weentime-frontend/.../shared/components/anomaly-alert-card/` |
| Spring backend | read-only consumer via `/presence/company/today`, `/presence/history` | already implemented in `presence-service` |

## Failure modes

* **No trained model** — `/api/ml/anomalies/*` returns empty dashboard, health
  reports `model_loaded: false`. Operator runs `POST /api/ml/train/anomaly`.
* **Spring gateway unreachable** — `WeenTimeBackendClient` returns
  `{"success": false, "error": "backend_unreachable"}`; detector returns an
  empty dashboard.
* **JWT mismatch** — minted service token signed with wrong secret → Spring
  401; surfaced as `backend_error` with `status_code: 401`.
* **Score normalization drift** — model bundle stores percentile-based
  `score_min`/`score_max` from training. If live data distribution shifts,
  retrain (`/train/anomaly`).
