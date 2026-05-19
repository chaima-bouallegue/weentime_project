# Smart Approval AI — Discovery

Reference map for the Smart Approval AI feature. Captures the real backend
contracts so the ML scoring module, a future `ai-approval-service`, and the
Angular module all speak the same language.

## 1. Request entities (all extend `Demande`, JOINED inheritance, rh-service)

`Demande` (table `demandes`) — shared base:
`id`, `utilisateurId`, `managerId`, `motif` (≤1000), `commentaire` (≤1000),
`statut` (`StatutDemandeEnum`), `dateCreation` (LocalDateTime, immutable),
`dateDecision` (LocalDateTime), `commentaireValidateur`.

| Domain | Entity / table | Distinct fields |
|---|---|---|
| Leave | `Conge` / `conges` | `dateDebut`, `dateFin` (LocalDate, not null), `nombreJours` (Integer), `typeCongeId`, `justificatifFourni` |
| Telework | `Teletravail` / `teletravails` | `dateDebut`, `dateFin`, `nombreJours` (Double), `adresse`, `typeTeletravail`, `periode`, `etapeActuelle` (default "MANAGER"), `commentaireManager`, `commentaireRH` |
| Authorization | `Autorisation` / `autorisations` | `typeAutorisation` (FK), `heureDebut`/`heureFin` (LocalTime), `duree` (minutes), `dateAutorisation` |

## 2. Status workflow — `StatutDemandeEnum`

`EN_ATTENTE_MANAGER` → `EN_ATTENTE_RH` → `APPROUVE(E)/VALIDEE`
Terminal/branch: `REFUSE(E)/REJETEE`, `ANNULE(E)`.

Flow: employee submits → `EN_ATTENTE_MANAGER`; manager validates → `EN_ATTENTE_RH`
or `APPROUVE`; RH validates → `APPROUVE`.

## 3. Endpoints the future ai-approval-service consumes (gateway :8322, prefix `/api/v1`)

Pending (manager / RH scoped):
- Leave: `GET /rh/conges/manager` (MANAGER), `GET /rh/conges/rh/pending` (RH)
- Telework: `GET /rh/teletravails/demandes-equipe` (MANAGER), `GET /rh/teletravails/en-attente-rh` (RH)
- Authorization: `GET /rh/autorisations/manager` (MANAGER), `GET /rh/autorisations/rh/history` (RH)

Decisions (for the manager's actual approve/reject — the AI never writes these):
- Leave: `PATCH /rh/conges/{id}/valider` (MANAGER), `/valider-rh` (RH), `/refuser` (both)
- Telework: `PATCH /rh/teletravails/{id}/valider-manager|valider-rh|rejeter-manager|rejeter-rh`
- Authorization: `PATCH /rh/autorisations/{id}/manager/validate|rh/validate|reject`

## 4. Employee + team + presence context (inputs to the model)

- Employee: `Utilisateur` (organisation-service, table `utilisateurs`):
  `id`, `nom`, `prenom`, `poste`, `dateCreation` (≈ hire date for seniority),
  `departement` (FK), `equipe` (FK), `manager` (FK), `entrepriseId`, `statut`.
  Internal fetch: `GET /api/v1/organisations/internal/users/{id}/summary`.
  Team members: `GET /api/v1/organisations/internal/managers/{managerId}/team`.
- Team coverage (who's absent in a window): presence-service
  `GET /api/v1/presence/team/today` (MANAGER), `/company/today` (RH),
  `/team/history?teamId=&page=&size=` for ranges.
- Attendance anomaly score: ml-service `/api/ml/anomalies/employee/{id}`
  (`score` 0..1) — feeds `anomaly_score_last_30_days`.

## 5. Gateway / build notes for a new microservice

- Gateway :8322, each service standalone Maven module (Spring Boot parent 3.4.0),
  no parent aggregator pom. Ports in use: auth 8181, organisation 8190,
  rh 8192, presence 8193, communication 8194, ai-service 8000, ml 8001, gateway 8322.
- A new `ai-approval-service` would: pick a free port (e.g. 8195), add a gateway
  route `Path=/api/ai/approval/**`, and use Feign clients to rh/organisation/presence
  + an HTTP client to ml-service `/api/ml/approval/analyze`.

## 6. ML scoring contract (this module — implemented)

The ML service is intentionally **context-agnostic**: the backend assembles the
`ApprovalAnalysisRequest` (durations, seniority, team coverage counts, history,
anomaly score) and the ML service returns a recommendation + risk factors. This
keeps the model free of cross-service coupling, mirroring the anomaly module.

Endpoints (added to ml-service): `POST /api/ml/approval/analyze`,
`POST /api/ml/approval/batch-analyze`, `POST /api/ml/approval/train`,
`GET /api/ml/approval/health`.

## 7. Build status

- **Implemented now**: ML `approval_ai` module (schemas, features, model with
  heuristic fallback, synthetic generator, training pipeline, routes, tests).
- **Not yet built (large, follow-on)**: `ai-approval-service` Spring microservice
  (Feign clients + ApprovalAuditLog + gateway route) and the Angular
  `ai-center/smart-approval` module. These depend on wiring into the multi-module
  build, gateway, and a DB migration — out of scope for this verifiable slice.
