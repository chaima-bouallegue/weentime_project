# PROJECT_DB_BACKEND_FRONTEND_ANALYSIS_REPORT

WeenTime — Backend + Frontend + Database + Chatbot data-flow analysis (read-only).

Date: 2026-05-15
Branch: main
Scope: PROJECT-DB-ANALYSIS-01 (analysis only — no code changes).
Companion task: AI-FE-07 has been **deferred** to a follow-up session (decision logged below in §11).

---

## 1. MCP tools used

| MCP | Used | How |
|---|---|---|
| filesystem | yes | Grep/Glob/Read across `weentime-backend`, `weentime-frontend`, `ai-service`. Four parallel Explore agents catalogued backend services, frontend routes, DB migrations, and AI chatbot architecture. |
| context7 | no | Not needed — analysis is project-internal. Patterns are well-established Spring/Angular. |
| **postgres** | **NOT AVAILABLE** | A `postgres` MCP server is not wired into this environment. Schema reconstructed from Flyway migrations (V1–V19 across 4 services). **Row counts and live data state are NOT in this report** — they require either a postgres MCP or a manual `psql` session. The "row count" sub-bullets in §4 are left as `(needs live DB)`. |
| playwright | available, not used | The Angular dev server (`:4200`) and AI service (`:8000`/`:8222`) were not running during this session. No live UI assertions were made. Recorded as a limitation in §11. Prior report `AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md` documents the same constraint. |
| redis | not available | Same — no redis MCP wired. Outbox/event tables reconstructed from migration SQL only. |
| docker | not used | No container introspection needed for this read-only analysis. |

Prior incremental reports mined for ground truth (so this report does not duplicate already-fixed issues):

- `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md` — `CHATBOT_PUBLIC_MODE` env-flagged public auth (already shipped — matches the AskUserQuestion answer for AI-FE-07).
- `AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md` — slot-flow escape, greeting handler, `safeTrimmedString` crash fix, role-aware quick prompts.
- `FE_AI_06_CHATBOT_POSITION_FIX_REPORT.md` — chat panel positioning rewrite (CSS only).
- `P5_01_MANAGER_RH_APPROVAL_MODERNIZATION_REPORT.md` — Manager/RH approval flows ported to modern `leave.*` / `telework.*` / `authorization.*` tools.
- `P4_01_RESPONSE_GUARD_REPORT.md`, `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`, `P3_01/02_PROVIDER_ROUTER_*.md`, `P6_*_REPORT.md` — guard rules, registry authority, Ollama provider, Redis backbone.

---

## 2. Project topology

### 2.1 Backend services (Spring Boot, gateway 8322)

| Service | Port | Migrations | Controllers (count) | Notes |
|---|---|---|---|---|
| `gateway` | 8322 | — | route filters | Single JWT gate (`JwtGlobalFilter`). Public-mode exemption list for `/api/v1/ai/v2/{chat,voice,chat/confirm}` and `/api/v1/ai/chat/history/*` when `CHATBOT_PUBLIC_MODE=true`. |
| `discovery` | Eureka | — | — | Service registry. |
| `config-server` | 8988 | — | — | Configs at `config-server/src/main/resources/configurations/`. |
| `auth-service` | 8181 | — | 2 (`AuthController`, `HealthController`) | Login, register, 2FA (TOTP/email/backup), `POST /admin/create-rh`. Issues JWT. |
| `organisation-service` | 8190 | V1–V13 | 16 | Users, entreprises, equipes, departements, roles, notifications, structure, RH owner assignment, internal sync endpoints. |
| `presence-service` | 8193 | V1–V3 | 5 | Presence/pointage. V3 redesigned around `attendance_sessions`. |
| `rh-service` | 8192 | V1–V19 | 20+ | Demandes, conges, autorisations, documents, teletravails, absences, solde_conges, type_* lookup tables, reunions, notifications, jours_feries, dashboards. |
| `communication-service` | 8194 | V1–V4 | 6 | Channels, messages, threads, reactions, attachments, outbox/event-stream, WebSocket gateway. Separate `communication` schema. |

Response envelope:
- **auth / organisation / rh / presence**: `ApiResponse<T>` — `{ success, data, error, details, message, timestamp }`.
- **communication**: `ApiEnvelope<T>` — `{ success, data, warnings, error: { code, message } }`.

### 2.2 Frontend (Angular, `:4200`, base `apiUrl=http://localhost:8322/api/v1`)

- Routes: `/` landing, `/login`, `/register`, `/auth/verify-2fa`, `/app/*` (shell + `authGuard` + `roleGuard`).
- Role-scoped trees under `/app/`: `employee/*`, `manager/*`, `rh/*`, `admin/*` plus shared `/app/messages/*`, `/app/notifications`, `/app/reunions/*`, `/app/vocal/*`.
- Chat widget mounted globally; service `AiCopilotService` → `POST /api/v1/ai/v2/chat`.
- `environment.chatbotPublicMode = true` (dev) — `SKIP_AUTH_REDIRECT` token bypasses 401 logout for chat requests.

### 2.3 Database (PostgreSQL, 5433 local)

Four logical schemas (one per service, with `communication-service` using a literal `communication` schema):

| Schema scope | Tables | Source migrations |
|---|---|---|
| organisation | 12 (entreprises, departements, equipes, utilisateurs, roles, utilisateur_roles, tokens, user_audit_logs, utilisateur_backup_codes, presences (mirror), role_permissions, notifications) | V1–V13 |
| presence | 5 (presences, work_schedules, work_schedule_days, overtimes, attendance_sessions) | V1–V3 |
| rh | 15 (demandes + JOINED children: absences, conges, autorisations, documents, teletravails; lookups: type_conges, type_autorisations, type_documents, type_absences; solde_conges, solde_audit_logs, absence_audit, notifications, jours_feries) | V1–V19 |
| communication | 13 (comm_channels, comm_channel_members, comm_direct_channel_participants, comm_messages, comm_reactions, comm_threads, comm_audit_log, comm_events_outbox, comm_notification_events, comm_events_stream, comm_message_history, comm_user_notification_preferences, comm_attachments) | V1–V4 |

### 2.4 Gateway routes (`/api/v1/*` → service)

| Source path prefix | Target | Notes |
|---|---|---|
| `/api/v1/auth/**` | auth-service | |
| `/api/v1/users/**`, `/api/v1/organisations/**`, `/api/v1/admin/**`, `/api/v1/structure/**`, `/api/v1/notifications/**` | organisation-service | |
| `/api/v1/rh/**`, `/api/v1/conges/**`, `/api/v1/solde-conges/**`, `/api/v1/demandes/**`, `/api/v1/documents/**`, `/api/v1/autorisations/**`, `/api/v1/absences/**`, `/api/v1/manager/**`, `/api/v1/teletravail/**`, `/api/v1/leave-balances/**` | rh-service | |
| `/api/v1/presence/**`, `/api/v1/presences/**`, `/api/v1/horaires/**`, `/api/presence/**` | presence-service | Legacy `/api/presence/**` kept by `PointageCompatibilityController`. |
| `/api/v1/communication/**` | communication-service | |
| `/api/v1/ai/**` (StripPrefix=3) | AI FastAPI service `:8000` | Only `v2/chat`, `v2/voice`, `v2/chat/confirm`, `chat/history/*` are JWT-exempt in public mode. |
| `/ws/**`, `/ws-org/**`, `/ws-rh/**`, `/ws-presence/**`, `/ws-communication/**` | corresponding service WebSockets | |

---

## 3. Module-by-module data map

For each module: page → Angular service method → API endpoint → backend controller → service/repo → entity/table → response shape → findings.

### 3.1 Users (admin/RH)

| Layer | Detail |
|---|---|
| FE pages | `/app/admin/users`, `/app/rh/structure/employes`, `/app/rh/structure/managers`, `/app/rh/structure/equipes`, `/app/rh/structure/departements` |
| FE service | `AdminApiService.getUsers()`, `getRoles()`, `getStatuses()`, `getCompanies()`, `getDepartments()`, `getTeams()`, `getManagers()`, `createUser()`, `updateUser()`, `deleteUser()` |
| Endpoint | `GET /api/v1/users?role=&status=&entrepriseId=&departementId=&equipeId=&managerId=&q=&page=&size=` + 6 lookup endpoints |
| Controller | `organisation-service / UserController.java` |
| Service / repo | `UtilisateurService` → `UtilisateurRepository` |
| Entity / table | `Utilisateur` → `utilisateurs` (with `entreprise_id`, `departement_id`, `equipe_id`, `manager_id`, `statut` ∈ {ACTIF,INACTIF,SUSPENDU,PENDING}) |
| Response | `Page<UserManagementResponse>` (paginated, not `ApiResponse` envelope — direct Spring `Page`) |
| **Findings** | (a) Backend filter lookup endpoints exist (`/users/{roles,statuses,companies,departments,teams,managers}`) — if FE dropdowns are empty, it's wiring, not missing BE. (b) `Page<T>` is returned **without** the `ApiResponse` envelope here while most other endpoints use it — frontend must read `response.content` not `response.data.content`. (c) `manager_id` was added in `V8__add_manager_to_utilisateurs.sql`; older code paths may still null it. (d) `avatar_url` added in V12 — confirm FE renders it. |

### 3.2 Dashboards

#### Admin dashboard (`/app/admin/dashboard`)

| Layer | Detail |
|---|---|
| FE service | `DashboardResolver('ADMIN')` typically aggregates: users count, enterprises count, pending validations, system stats. |
| Endpoints called | Mix of `GET /users` (count), `GET /organisations/entreprises`, `GET /rh/stats`, `GET /presence/global/analytics`. |
| Backend | `UserController.getUsers()`, `EntrepriseController.getAll()`, `RhStatsController` (under rh-service), `PresenceController.getGlobalAnalytics()` |
| **Findings** | Admin has no dedicated `/api/v1/admin/dashboard` aggregator — the dashboard makes N parallel calls. If any one 5xx's the whole tile shows 0. **Cards-show-0 root cause hypotheses:** (1) `/rh/stats` returns aggregated counts that depend on `entreprise_id` scoping — for ADMIN there may be no `entreprise_id` in JWT, so it filters out everything; (2) presence analytics needs `entreprise_id` query param. |

#### RH dashboard (`/app/rh/dashboard`)

| Layer | Detail |
|---|---|
| FE service | `RhApiService.getDashboard()` → `GET /api/v1/rh/dashboard`; `getStatsOverview()` → `GET /api/v1/rh/stats` |
| Backend | `rh-service / RhDashboardCompatibilityController` → `RhDashboardService` |
| Entity / table | Aggregates from `demandes`, `conges`, `solde_conges`, `documents`, `teletravails`, `autorisations` filtered by `entreprise_id` |
| **Findings** | The RH dashboard uses two endpoints (`/rh/dashboard` envelope + `/rh/stats` overview). The FE unwraps via `unwrap(response) ?? this.emptyDashboard()` (rh-api.service.ts:114) — silent fallback to empty if the envelope shape mismatches. **Card-shows-0 root cause:** if backend returns `{ success: true, data: { ... } }` but FE expects raw `{ ... }` (or vice versa), `unwrap()` returns null → empty dashboard with no error. |

#### Manager dashboard (`/app/manager/dashboard`)

| Layer | Detail |
|---|---|
| FE service | `ManagerDashboardService.getDashboardData()` aggregates `ManagerApiService.getPendingRequests()`, `getManagerTeamMembers()`, `getTeamPresence()` |
| Endpoints | `GET /rh/demandes/manager/{id}`, `GET /rh/demandes/manager/{id}/all`, `GET /presence/manager/team` |
| **Findings** | (a) Filtering EN_ATTENTE_MANAGER happens client-side (per frontend exploration). Loads all → filters → wasteful. (b) `presence/manager/team` requires the caller to actually have team members assigned (`utilisateurs.manager_id`). If `manager_id` isn't seeded for the test users, the team is empty → card shows 0. |

#### Employee dashboard (`/app/employee/dashboard`)

| Layer | Detail |
|---|---|
| FE service | `DashboardResolver('EMPLOYEE')` — calls personal endpoints: `/presence/me/today`, `/rh/solde-conges/me/all`, `/rh/conges/me`, etc. |
| **Findings** | Should be the most reliable dashboard — all reads are scoped by JWT user_id. If empty, likely 401 or unauthenticated. |

### 3.3 Pointage / presence

| Layer | Detail |
|---|---|
| FE pages | `/app/employee/pointage`, `/app/manager/pointage`, `/app/manager/presence`, `/app/admin/pointage`, `/app/admin/presence`, `/app/rh/planning` |
| FE service | `PresenceMonitoringService.getActiveSession()`, `checkIn()`, `checkOut()`, `getTodayPresence()`, `getHistory()` |
| Endpoints | `GET /presence/me/today`, `POST /presence/me/check-in`, `POST /presence/me/check-out`, `GET /presence/me/history`, `GET /presence/me/stats`, `GET /presence/team/today` (manager), `GET /presence/global/analytics` (admin) |
| Controller | `presence-service / PresenceController.java` (plus `HoraireController`, `PointageCompatibilityController`, `InternalPresenceController`) |
| Service / repo | `PresenceService` → `AttendanceSessionRepository` (modern), `PresenceRepository` (legacy V1/V2) |
| Entity / table | `AttendanceSession` → `attendance_sessions` (V3, modern: `session_status ∈ {OPEN, CLOSED}`, `daily_status ∈ {IDLE, WORKING, LATE}`). Legacy `Presence` → `presences` (still populated for backward compat by V3 logic). |
| **Findings** | (a) **Two tables for the same domain** — `presences` (legacy) and `attendance_sessions` (V3 modern). The V3 migration intentionally redesigned but kept `presences` populated. Risk: divergence if one path writes only to one table. (b) Timestamps stored as `TIMESTAMP` (no timezone) — server timezone matters. If FE renders raw UTC vs local without explicit timezone, displayed times shift. (c) Manager team presence depends on `utilisateurs.manager_id` being set. (d) `attendance_sessions.attendance_date` is the day-key but `check_in_time` is the timestamp — FE must reconcile them when crossing midnight. |

### 3.4 Requests workflow (congés, télétravail, autorisations, documents, absences)

| Aspect | Detail |
|---|---|
| Parent entity | `demandes` (`Demande`) — JPA JOINED inheritance; PK `id` shared with each child. |
| Child entities | `Conge` → `conges`; `Autorisation` → `autorisations`; `Document` → `documents`; `Teletravail` → `teletravails`; `Absence` → `absences`. Each child PK = `demande_id` (one-to-one). |
| Status enum | `demandes.statut` ∈ `{EN_ATTENTE_MANAGER, EN_ATTENTE_RH, APPROUVEE, REFUSEE, ANNULEE}` (after V18 normalization to feminine form). |
| Type enum | `demandes.type_demande` ∈ `{CONGE, AUTORISATION, DOCUMENT, TELETRAVAIL, ABSENCE}` (V9 added ABSENCE). |
| Lookup tables | `type_conges`, `type_autorisations`, `type_documents`, `type_absences` (V13/V14 extracted from inline enums to per-tenant tables). All carry `entreprise_id` after V19. |
| FE service | `RhApiService.getRequests({ statut, type, employee, dateFrom, dateTo, page, size })` |
| Endpoint | `GET /api/v1/rh/demandes?statut=&type=&employee=&dateFrom=&dateTo=&page=&size=` |
| Approval endpoints (modern) | `PATCH /rh/conges/{id}/valider`, `/valider-manager`, `/valider-rh`, `/refuser`, `/refuser-rh`, `/reject` (and parallel ones for `/rh/teletravail/{id}/*-manager`, `*-rh`, `/rh/autorisations/{id}/{manager,rh}/validate`, `/documents/{id}/refuser`, `/documents/{id}/valider`). |
| Approval enums (FE bug risk) | The legacy `rh-api.service.ts:161-178` `approveRequest` / `rejectRequest` send `statut: 'APPROUVEE' / 'REFUSEE'` in a body to `PUT /rh/demandes/{id}/statut`. This is a **legacy compat path** — most current decision flows use the typed PATCH endpoints documented in `P5_01`. Frontend has two parallel approval paths; the typed one is preferred. |
| Status enum mismatch risk | The DB has been migrated three times (V3 added EN_ATTENTE_*, V6 normalized to masculine, V11 simplified, V18 normalized again to feminine). Any frontend constant still using `'APPROUVE'` (masculine) will silently match nothing. **Confirm FE uses `'APPROUVEE'`/`'REFUSEE'`/`'ANNULEE'` (feminine, current).** |

### 3.5 Organization (entreprises / departements / equipes / managers / RH owners)

| Layer | Detail |
|---|---|
| FE pages | `/app/admin/entreprises`, `/app/admin/departements`, `/app/admin/equipes`, `/app/admin/rh-owners`, `/app/rh/structure/{departements,equipes,employes,managers}` |
| FE service | `OrganisationService.getDepartments/Teams/Employees/Managers()` (calls `/structure/*`), `AdminApiService.getEntreprises/Equipes/Departements()` (`/organisations/*`) |
| Endpoints | `GET /api/v1/structure/{departments,teams,managers,employees}` (org-service `StructureController`); `GET/POST/PUT/DELETE /api/v1/organisations`, `/api/v1/organisations/{id}/teams`, etc. |
| Entities | `Entreprise` → `entreprises`; `Departement` → `departements`; `Equipe` → `equipes` (with `responsable_id`→`utilisateurs.id`, `departement_id`→`departements.id`); `Utilisateur` self-FK `manager_id`. |
| Capability gaps | (a) **No backend tool** for "RH assigns employee to team" via a single high-level endpoint — only `PUT /api/v1/users/{id}` with full `UserManagementRequest` body. The chatbot RH agent reports "capability unavailable" for this. (b) **No backend endpoint** named like `POST /rh/affectations` for bulk reassignment. (c) RH-owner page → `/api/v1/admin/rh-owners` requires checking which controller serves it (likely `RhManagementController`). |

### 3.6 Chatbot / AI data tools

See §6 for the full reality check. Key tool→endpoint map already validated by `P5_01_MANAGER_RH_APPROVAL_MODERNIZATION_REPORT.md`. All ~50 tool URLs match existing backend endpoints (no dead URLs identified by the AI architecture exploration).

---

## 4. Database table inventory

`(row counts = needs live DB; postgres MCP unavailable)`

### 4.1 organisation schema

| Table | Purpose | Entity | Row count | Key columns | Relations |
|---|---|---|---|---|---|
| `entreprises` | Tenant root | Entreprise | needs live DB | id, nom, siret(UQ), secteur, code_invitation, max_users, current_users | parent of departements, equipes, utilisateurs |
| `departements` | Org dept | Departement | needs live DB | id, nom, code_interne(UQ), entreprise_id | → entreprises |
| `equipes` | Team | Equipe | needs live DB | id, nom, responsable_id, departement_id, effectif_maximum | → utilisateurs(responsable), departements |
| `utilisateurs` | User | Utilisateur | needs live DB | id, email(UQ), nom, prenom, statut, entreprise_id, departement_id, equipe_id, manager_id, two_factor_*, avatar_url | self-FK manager_id; → entreprises, departements, equipes |
| `roles` | Role lookup | Role | 4 (seeded: ROLE_{EMPLOYEE,MANAGER,RH,ADMIN}) | id, nom(UQ) | M:N via utilisateur_roles |
| `utilisateur_roles` | User↔role join | — | needs live DB | utilisateur_id, role_id | composite PK |
| `tokens` | Auth tokens | Token | needs live DB | id, token, utilisateur_id, date_expiration | → utilisateurs |
| `user_audit_logs` | Audit | UserAuditLog | needs live DB | id, action, performed_by, target_user, details, created_at | — |
| `utilisateur_backup_codes` | 2FA backup | — | needs live DB | utilisateur_id, code | composite PK |
| `presences` | **Legacy mirror** of presence sessions | Presence | needs live DB | id, utilisateur_id, date_presence(UQ with user), heure_entree, heure_sortie, status, overtime_hours | → utilisateurs |
| `role_permissions` | Permission catalog | — | needs live DB | role_id, permission | composite PK; → roles |
| `notifications` | App notifications | Notification | needs live DB | id, user_id, title, message, type, is_read, metadata(JSONB) | → utilisateurs |

### 4.2 presence schema

| Table | Purpose | Row count | Key columns |
|---|---|---|---|
| `presences` | Legacy daily presence | needs live DB | id, utilisateur_id, date_presence, heure_entree, heure_sortie, total_heures_travaillees, status, source, version |
| `work_schedules` | Per-user schedule | needs live DB | id, utilisateur_id(UQ), heure_debut, heure_fin, tolerance_retard_minutes |
| `work_schedule_days` | Schedule days | needs live DB | work_schedule_id, jour_travail (composite PK) |
| `overtimes` | Overtime records | needs live DB | id, utilisateur_id, date_presence, heures_supplementaires, approuvee |
| `attendance_sessions` | **Modern** open/closed session model (V3) | needs live DB | id, utilisateur_id, attendance_date, check_in_time, check_out_time, duration_seconds, session_status (OPEN/CLOSED), source, localisation, late_arrival, daily_status (IDLE/WORKING/LATE) |

### 4.3 rh schema (most evolved — V19)

| Table | Purpose | Row count | Notable columns |
|---|---|---|---|
| `demandes` | Parent of all HR requests (JOINED inheritance) | needs live DB | id, type_demande, statut, utilisateur_id, manager_id, entreprise_id (V5), date_creation, date_decision, commentaire, commentaire_validateur, motif, version |
| `conges` | Leave child | needs live DB | demande_id (PK→FK), date_debut, date_fin, type_conge_id, nombre_jours, justificatif_fourni |
| `autorisations` | Authorization child | needs live DB | demande_id (PK→FK), date_autorisation (V12), heure_debut, heure_fin, duree, type_autorisation_id (V13) |
| `documents` | Document request child | needs live DB | demande_id, type_document_id (V14), document_url, mois_concerne, generated_by_ai (V4), contenu_ia, ai_model_used (V19), tokens_used (V19), commentaire_rh, nombre_exemplaires |
| `teletravails` | Telework child | needs live DB | demande_id, date_debut, date_fin, type_teletravail, periode, etape_actuelle, commentaire_manager, commentaire_rh, adresse, nombre_jours |
| `absences` | Absence child | needs live DB | id, demande_id, type_absence_id, date_debut, date_fin, justificatif (TEXT), duree_jours (V6), motif_refus, minio_path |
| `type_conges` | Leave-type lookup | needs live DB | id, libelle, decompte_jours, nombre_jours_max, require_justificatif, entreprise_id (V19) |
| `type_autorisations` | Auth-type lookup (V13 extracted from enum) | seeded 4 types | id, libelle(UQ), max_heures_mois, require_justificatif, entreprise_id (V19) |
| `type_documents` | Doc-type lookup (V14 extracted, V19 expanded) | seeded 7 types | id, libelle, code(UQ), ai_prompt_template, ai_model, ai_temperature, content_template, workflow_type, retention_mois, mode_generation, entreprise_id |
| `type_absences` | Absence-type lookup | 5 seeded (V8) | id, libelle, type CHECK ∈ {MALADIE, ACCIDENT_TRAVAIL, CONGE_MATERNITE, CONGE_PATERNITE, ABSENCE_INJUSTIFIEE, EVENEMENT_FAMILIAL, AUTRE} |
| `solde_conges` | Per-user leave balance | needs live DB | id, utilisateur_id, type_conge_id, annee, jours_acquis, jours_utilises, jours_restants, jours_en_attente, version (V16), entreprise_id (V19), UQ(utilisateur_id, type_conge_id, annee) |
| `solde_audit_logs` | Balance change audit (V15) | needs live DB | id, action, utilisateur_id, type_conge_id, ancien_solde, nouveau_solde, motif, perform_by, annee, timestamp |
| `absence_audit` | Absence change audit (V6) | needs live DB | id, absence_id, action, acteur_id, timestamp, commentaire |
| `notifications` | RH notifications (V17) | needs live DB | id, destinataire_id, destinataire_role, type, titre, message, lu, entreprise_id, route, entity_id, entity_type |
| `jours_feries` | Holidays | needs live DB | id, nom (V19), entreprise_id (V19), is_global |

### 4.4 communication schema

| Table | Purpose | Row count | Notable columns |
|---|---|---|---|
| `comm_channels` | Channels | needs live DB | id (UUID), entreprise_id, type (GENERAL/DIRECT/WORKFLOW), visibility, slug, name, equipe_id, workflow_type, workflow_entity_id, is_private, is_archived |
| `comm_channel_members` | Membership | needs live DB | channel_id, user_id, role (OWNER/ADMIN/MEMBER), notification_level, last_read_message_id, joined_at, left_at, is_muted, is_pinned (composite PK channel_id+user_id) |
| `comm_direct_channel_participants` | DM participant hash | needs live DB | channel_id, entreprise_id, participant_hash, participant_count |
| `comm_messages` | Messages | needs live DB | id (UUID), channel_id, sender_id, parent_message_id, type, body, rich_body(JSONB), status, client_message_id, metadata(JSONB), edited_at, deleted_at |
| `comm_reactions` | Reactions | needs live DB | message_id, user_id, emoji (composite PK) |
| `comm_threads` | Thread metadata | needs live DB | root_message_id, channel_id, reply_count, last_reply_id, last_reply_at, participant_count |
| `comm_audit_log` | Audit | needs live DB | id, entity_type, entity_id, action, actor_id, payload(JSONB) |
| `comm_events_outbox` | Outbox for reliable delivery | needs live DB | id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, next_attempt_at, idempotency_key(UQ), max_attempts |
| `comm_notification_events` | Notification state machine (V2) | needs live DB | id, notification_event_id(UQ), recipient_id, event_type, group_key, status |
| `comm_events_stream` | Event sourcing replay (V3) | needs live DB | event_id, stream_order(BIGINT generated UQ), scope CHECK ∈ {CHANNEL, USER}, recipient_user_id, channel_id, type, payload, replay_available_until |
| `comm_message_history` | Edit history (V3) | needs live DB | id, message_id, edited_by, previous_body, previous_rich_body(JSONB), edited_at, reason |
| `comm_user_notification_preferences` | Per-user prefs (V3) | needs live DB | id, user_id(+ent UQ), direct_message_enabled, mention_enabled, reaction_enabled, channel_notification_mode |
| `comm_attachments` | File attachments (V4) | needs live DB | id, message_id, uploader_id, file_name, original_name, content_type, file_size, storage_path |

### 4.5 Cross-service FKs (not enforced at DB level — implicit by `entreprise_id` + `utilisateur_id`)

- `rh.demandes.utilisateur_id` → `organisation.utilisateurs.id` (every HR request).
- `rh.demandes.manager_id` → `organisation.utilisateurs.id`.
- `rh.solde_conges.utilisateur_id` → `organisation.utilisateurs.id`.
- `rh.notifications.destinataire_id` → `organisation.utilisateurs.id`.
- `presence.*.utilisateur_id` → `organisation.utilisateurs.id`.
- `communication.comm_*.{user_id,sender_id,uploader_id,...}` → `organisation.utilisateurs.id`.
- `communication.comm_channels.equipe_id` → `organisation.equipes.id`.
- `communication.comm_channels.workflow_entity_id` (where `workflow_entity_type='DEMANDE'`) → `rh.demandes.id`.
- All tables carry `entreprise_id` enforced application-side for multi-tenancy isolation.

---

## 5. Missing / mismatched endpoints

| # | Frontend need | Current endpoint(s) called | BE controller exists? | DB table exists? | Risk / proposed fix |
|---|---|---|---|---|---|
| 1 | Admin global dashboard aggregator (single call) | N parallel `/users`, `/organisations/entreprises`, `/rh/stats`, `/presence/global/analytics` | Each independently — yes | Yes | Add `GET /api/v1/admin/dashboard` that fans out server-side and returns a unified `ApiResponse<AdminDashboardDTO>`. Eliminates partial-failure → 0-card UX. |
| 2 | RH dashboard envelope shape | `/api/v1/rh/dashboard` returns `ApiEnvelope<RhDashboardSnapshot>`; FE `unwrap` falls back to empty silently | Yes (`RhDashboardCompatibilityController`) | Yes | Add an integration test that pins the wire shape; surface envelope errors as toasts instead of silent empty state. |
| 3 | Manager pending-requests server-side filter | `/rh/demandes/manager/{id}/all` returns all, FE filters EN_ATTENTE_MANAGER client-side | Yes | Yes | Add `?statut=EN_ATTENTE_MANAGER` query param honoured server-side. |
| 4 | "RH assigns employee to team / department / manager" (single op) | None — FE uses generic `PUT /api/v1/users/{id}` with whole user body | Partial — `UserController.updateUser` exists | Yes | Add `POST /api/v1/users/{id}/affectations` accepting `{ equipeId?, departementId?, managerId? }` + audit log entry. Required by RH chatbot for "je veux affecter user à équipe". |
| 5 | "Create team" / "Create department" via chatbot | None | `EquipeController` POST exists; `DepartementController` POST likely exists | Yes | Already exist as REST endpoints — register them as ToolRegistry tools (e.g. `organisation.create_team`) for chatbot RH agent. **No backend work needed**; only AI-service tool wiring. |
| 6 | "Assign RH owner to enterprise" | `/admin/rh-owners` page exists | Likely `RhManagementController` | Yes | Confirm endpoint signature; ensure FE form posts a `{ entrepriseId, rhUserId }` payload. |
| 7 | Admin: list reunions across enterprises | `/reunions/*` | `ReunionController` (rh-service) | `reunions`, `participants_reunion` | Verify multi-tenant scope; admin may need an `entrepriseId=` filter. |
| 8 | Frontend `approveRequest`/`rejectRequest` (legacy) | `PUT /api/v1/rh/demandes/{id}/statut` with `statut:'APPROUVEE'` | Yes (compat) | Yes | Migrate FE to typed PATCH endpoints (`/conges/{id}/valider`, etc.) per P5_01. Legacy path duplicates business logic and risks status-string drift. |
| 9 | Status enum drift | DB uses feminine after V18 (`APPROUVEE`, `REFUSEE`, `ANNULEE`) | — | — | Grep FE for masculine forms (`'APPROUVE'`, `'REFUSE'`, `'ANNULE'`) and fix. |
| 10 | Presence: timezone in `attendance_sessions.check_in_time` | `TIMESTAMP` (no TZ) | — | Yes | Either migrate column to `TIMESTAMP WITH TIME ZONE` or document that all timestamps are server-local and have FE format with explicit TZ. Otherwise pointage times shift across browsers. |
| 11 | Dual presence tables (`presences` + `attendance_sessions`) | Both written by V3 logic | Yes | Yes | Pick one as source of truth. If `attendance_sessions` is canonical, mark `presences` deprecated and ensure all reads use sessions. Eliminates divergence risk. |
| 12 | Admin diagnostics (chatbot "System health", "Redis status", "Braintrust status") | AI service `/health/deep` returns provider/redis/RAG/Braintrust status; no FE page consumes it as a dashboard | AI service yes | — | Add an `/app/admin/system-health` page that polls `/api/v1/ai/health/deep` + `/actuator/health` per Spring service. Chatbot already routes these queries to admin tools. |

---

## 6. Chatbot capability reality check

Based on backend endpoint catalog + tool registry catalog + P5_01 modernization report. Each capability is tagged as one of:

- ✅ **supported now** — tool exists + backend endpoint verified + role allowed + status whitelisted in guard.
- 🟡 **partially** — tool exists but degraded (FE crash, fallback for valid input, missing data).
- ❌ **unsupported until backend endpoint exists** — would require new BE work.
- ⚠️ **unsafe to fake** — must not be answered without backing data.

### EMPLOYEE

| Capability | Status | Notes |
|---|---|---|
| Personal pointage status ("est-ce que j'ai pointé") | ✅ | `attendance_tools.get_pointage_status` → `/presence/me/today`. AI-FE-05 fixed routing trap. |
| Check-in / check-out (with confirmation) | ✅ | Write actions; `WorkflowOrchestrator` enforces confirmation. |
| Week hours / history | ✅ | `/presence/me/stats`, `/presence/me/history`. |
| Leave balance | ✅ | `/rh/solde-conges/me/all`. |
| List my leave requests | ✅ | `/rh/conges/me`. |
| Create leave request | ✅ | `/rh/conges` with confirmation. |
| List authorization types | ✅ | `/rh/parametres/types-autorisations` — backend returns `type_autorisations` rows. AI-FE-07's "c quoi les autorisations dispo" should reach this; if it doesn't, that's an intent-routing bug (deferred to AI-FE-07). |
| Create authorization | ✅ | `POST /autorisations` with confirmation. |
| List telework / create | ✅ | `/rh/teletravail/mes-demandes`, `POST /rh/teletravail`. |
| Document request ("je veut une demande de document") | ✅ | `document.request` tool → `POST /documents`. AI-FE-05 fixed routing (was being trapped by leave slot-fill). |
| Daily digest ("Show my daily summary") | ✅ | `EmployeeCopilot.build_daily_briefing` (parallel tool calls — presence + balance + pending + docs). |
| Meetings / planning ("c quoi mon planning") | 🟡 | `reunions` tables exist; `ReunionController` exists; but **no AI tool wraps it yet**. Should return "capability unavailable" gracefully — not unsafe fallback. AI-FE-07 fix. |
| Communication: list channels / messages | ✅ | `communication.list_channels` → `/communication/channels`. Send-message tool not currently registered for chatbot — read-only. |

### MANAGER

| Capability | Status | Notes |
|---|---|---|
| Personal pointage (same as employee) | ✅ | Same tools, role-allowed. |
| Team presence ("Pointage équipe") | ✅ | `attendance_tools.get_team_presence` → `/presence/team/today`. Requires `utilisateurs.manager_id` to be set for team members. |
| Today's team summary | ✅ | `ManagerCopilot.build_daily_briefing` aggregates `/rh/demandes/manager/{id}` + `/presence/team/today`. |
| Pending approvals | ✅ | `leave.list_manager_requests`, `telework.list_manager_requests`, `authorization.list_manager_requests` (P5_01). |
| Approve/reject leave/telework/authorization (with confirmation) | ✅ | Typed PATCH endpoints; confirmation enforced. |
| Attendance anomalies (who forgot checkout, who's absent) | 🟡 | Derivable from `/presence/team/today` but no dedicated "anomalies" tool exists. Currently surfaces via team summary; explicit anomaly tool would improve UX. |

### RH

| Capability | Status | Notes |
|---|---|---|
| Personal employee actions | ✅ | Same EMPLOYEE tools, role-allowed. |
| RH backlog ("RH backlog") | ✅ | `leave.list_rh_pending`, `telework.list_rh_pending`, `authorization.list_rh_requests`, `document.list_rh`. |
| Approve/reject as RH (with confirmation) | ✅ | `leave.rh_decide`, `telework.rh_decide`, `authorization.decide` (RH role variant). |
| RH stats / dashboard | ✅ | `rh.get_stats` → `/rh/stats`; chatbot RH digest. |
| Document workload | ✅ | `/documents/rh/demandes`. |
| Document AI generation | ✅ | `/documents/rh/generate-ai`. |
| **Assign employee to team/department/manager** | ❌ | Backend endpoint MISSING (see §5 #4). Chatbot must return "capability unavailable", not fake success. |
| **Create team / department** via chatbot | ❌ (tool) ✅ (backend) | Backend endpoints exist (`POST /api/v1/organisations/{id}/teams`, departements POST). Tool not registered. AI-FE-07 should add `organisation.create_team` and `organisation.create_department` tools — no backend work needed. |
| Create new platform user ("nheb nzid user jdid") | ⚠️ | Backend endpoint exists (`POST /api/v1/users` with RH role allowed). Chatbot does not currently wrap it for RH (only ADMIN). Decision: keep ADMIN-only or expose to RH? Out of scope for this analysis. |
| Manage type_autorisations / type_documents per tenant | ❌ | Backend has the tables and they carry `entreprise_id`, but no CRUD endpoint at gateway level for these lookup tables. Add `GET/POST /api/v1/rh/parametres/types-{conges,autorisations,documents}` if RH parameters page expects it. |

### ADMIN

| Capability | Status | Notes |
|---|---|---|
| List users / get details | ✅ | `admin.list_users` → `/users`; `admin.get_user_details`. |
| Create user (with confirmation) | ✅ | `admin.create_user` → `POST /users`. |
| List enterprises | ✅ | `admin.list_companies` → `/organisations/entreprises`. |
| Update user role / assign manager | 🟡 | Tool may use generic `PUT /users/{id}`; needs a dedicated `users.{id}/role` or `users.{id}/manager` endpoint for cleaner audit (see §5 #4). |
| System health ("System health") | ✅ | AI service `/health/deep` returns deep status. Currently returned via admin tool. AI-FE-07 quick-prompts already wired in AI-FE-05. |
| AI provider status / Redis / Braintrust | ✅ | Same `/health/deep` endpoint. |
| **Tenant configuration issues** | 🟡 | Tool `admin.list_org_users` exists, but a dedicated "tenant misconfig" diagnostic (e.g. users without `entreprise_id`, RH owners not assigned, teams without manager) doesn't exist. Add a BE diagnostic endpoint `GET /api/v1/admin/diagnostics/tenant/{id}` and an `admin.tenant_diagnostics` tool. |

### Cross-role: features that look like capabilities but are not safe to fake

- ⚠️ **Salary / payroll**: not a domain in this schema. Chatbot must refuse.
- ⚠️ **External attendance device sync**: `presences.source` field exists but no API for it. Refuse "did the badge work" questions.
- ⚠️ **Free-text Slack-like commands ("send message to X")** — `communication.list_channels` is read-only in the registry. Sending is gated to FE flow with confirmation; chatbot must not write messages until a `communication.send_message` tool is added.

---

## 7. Dashboard issues — concrete diagnoses

| Issue | Root cause | Fix |
|---|---|---|
| Admin dashboard tiles show 0 | (a) Each tile fans out to a different BE; one 5xx silently empties the tile. (b) `/rh/stats` for ADMIN may filter on `entreprise_id` from JWT — for global admin (no enterprise), filter eats everything. | (1) Add server-side admin aggregator (§5 #1). (2) Make `/rh/stats` accept `entrepriseId=` query and treat empty as "all tenants" when caller is ADMIN. |
| RH dashboard cards empty | Envelope unwrap silently returns `null` → `emptyDashboard()` (rh-api.service.ts:114). Could be (a) BE returns `{success,data}` but FE expects `{...}` directly, or (b) `entreprise_id` not present in JWT. | (1) Pin envelope shape with a contract test. (2) Log a warning when `unwrap` returns null. (3) Verify JWT contains `entrepriseId` for RH users. |
| Manager dashboard "pending approvals" = 0 even though backlog exists | FE filters EN_ATTENTE_MANAGER client-side. If BE returns wrong shape (e.g. `Page<T>` not unwrapped), filter sees `[]`. | (1) Add `?statut=` server filter (§5 #3). (2) Verify FE reads `response.content` not `response.data.content` (Spring `Page` is raw, not enveloped here). |
| Employee dashboard empty | Most likely auth issue: JWT expired or `entrepriseId` claim missing. | Check `/v2/chat` behaviour vs. dashboard — if chatbot works (public mode) but dashboard doesn't, user is not logged in. |
| Presence card shows "—" | Could be querying wrong table (`presences` legacy vs `attendance_sessions`). | Verify `/presence/me/today` reads from `attendance_sessions` (modern). |

---

## 8. Users page issues

Looking at `UserController` filters and the FE `AdminApiService`:

| Issue | Diagnosis |
|---|---|
| Role filter empty | Backend `/api/v1/users/roles` returns `List<String>` (NOT enveloped). FE must call `.subscribe(roles => ...)` directly. If FE expects `{data: [...]}`, dropdown stays empty. |
| Status filter empty | Same shape: `/api/v1/users/statuses` returns `List<String>`. Same envelope mismatch risk. |
| Enterprise filter empty | `/api/v1/users/companies` returns `List<LookupOptionResponse>`. Confirm `LookupOptionResponse` has `{id, label}` and FE uses both. |
| Manager column null | `utilisateurs.manager_id` may not be set for legacy users (only added in V8). Run a one-time data hydration (assign team responsable as manager) — out of scope here, but flagged. |
| "Create user" button missing for RH | Backend permits RH (`@PreAuthorize("hasAnyRole('ADMIN', 'RH')")`). If FE hides the button for RH, FE check is stricter than BE. |
| Actions menu disabled | Backend allows ADMIN+RH for all CRUD. If menu is grey, check FE role gate. |
| Pagination | Returns raw Spring `Page<UserManagementResponse>` (not `ApiResponse` envelope). FE must read `.content`, `.totalElements`, `.totalPages`, `.number` directly. **Common bug source** — many other endpoints use `ApiResponse`. |

---

## 9. Pointage issues

| Issue | Diagnosis | Fix |
|---|---|---|
| Current session missing | (a) `/presence/me/today` may return last completed session, not today's open session. (b) If user is on `presences` (legacy) path but UI expects `attendance_sessions` (modern). | Inspect `PresenceController.today()` — confirm it queries `attendance_sessions` filtered by `session_status='OPEN'`. |
| Wrong time displayed | TIMESTAMP columns are timezone-naive. FE renders as UTC, user expects local. | Either migrate to `TIMESTAMP WITH TIME ZONE`, or add explicit `Europe/Paris` formatting on FE. |
| History gaps | `presences` and `attendance_sessions` may diverge if writes are split. | Pick one source of truth (§5 #11). |
| Team presence empty for manager | `utilisateurs.manager_id` not seeded. | Data fix or fall back to `equipes.responsable_id` when manager_id is null. |
| Forgot-checkout detection | `session_status='OPEN'` past end-of-day → flag. Tool exists; UI display not yet implemented. | Add a manager-dashboard tile "team members with open sessions past EOD". |

---

## 10. Request workflow issues

| Issue | Diagnosis | Fix |
|---|---|---|
| Statuses stay "en cours" | Could be (a) typed PATCH not being called; instead legacy `PUT /rh/demandes/{id}/statut` is used with a possibly-stale status string. (b) BE blocks transition because `entreprise_id` mismatch between approver and requester. | Migrate FE to typed PATCH endpoints (§5 #8). Add audit logging on rejected transitions. |
| Manager/RH not assigned to demande | `demandes.manager_id` is set only when employee's `utilisateurs.manager_id` is non-null. Without a manager, demande skips manager step. V11 routes documents/absences directly to EN_ATTENTE_RH. | Backfill manager assignment; or fall back to `equipes.responsable_id` when computing manager. |
| Wrong status mapping | Status enum migrated 4 times. FE constants may still hold pre-V18 forms. | Single source of truth: extract from a `/api/v1/rh/demandes/statuts` endpoint (or hard-code the V18 values centrally on FE and audit usages). |
| Document approval fails silently | `PUT /documents/{id}/valider` requires generated content or document URL. AI agent already returns "capability unavailable" (P5_01) — but FE manual approval flow may not. | FE should disable approve button until a document URL is uploaded. |
| Solde conges race | `solde_conges.version` (V16 added) enables optimistic locking. If FE doesn't send `version` on update, OptimisticLockException could fire silently. | Confirm FE includes `version` in update payloads. |

---

## 11. Recommended task plan

Ordered by dependency. AI-FE-07 is a follow-up session (per user decision).

### A. Backend (Spring Boot)

1. **`B1`** Add `GET /api/v1/admin/dashboard` aggregator (§5 #1, §7). Returns a unified DTO so admin tiles stop flashing 0 on partial failures. _~2 hours._
2. **`B2`** Add `?statut=` query param to `GET /rh/demandes/manager/{id}/all` (§5 #3, §10). _~1 hour._
3. **`B3`** Add `POST /api/v1/users/{id}/affectations` accepting `{ equipeId?, departementId?, managerId? }` + audit log (§5 #4, §6 RH). Unblocks chatbot RH "affecter user à équipe". _~3 hours._
4. **`B4`** Add `GET /api/v1/admin/diagnostics/tenant/{id}` for tenant misconfig (§5 #12, §6 ADMIN). Lists users without entreprise, teams without manager, RH owners not assigned. _~3 hours._
5. **`B5`** Add `GET/POST /api/v1/rh/parametres/types-{conges,autorisations,documents}` per-tenant CRUD if not already present (§6 RH). _~3 hours._
6. **`B6`** Migrate `attendance_sessions.check_in_time` / `check_out_time` to `TIMESTAMP WITH TIME ZONE` (or document FE TZ assumption) (§5 #10, §9). _~2 hours, plus Flyway V20._
7. **`B7`** Decide single source of truth for presence: `attendance_sessions` (recommended). Mark `presences` as deprecated; ensure all reads go via sessions (§5 #11). _~2 hours._

### B. Frontend (Angular)

1. **`F1`** Audit envelope shape mismatches: `Page<T>` (raw) vs `ApiResponse<T>` (enveloped). Critical: `UserController` returns raw `Page`; `RhDashboard` returns enveloped. (§4.1, §7, §8). _~3 hours._
2. **`F2`** Audit status enum constants — fix any masculine forms (`APPROUVE`/`REFUSE`/`ANNULE`) to feminine (`APPROUVEE`/`REFUSEE`/`ANNULEE`) per V18 (§5 #9, §10). _~1 hour grep + fix._
3. **`F3`** Migrate `RhApiService.approveRequest`/`rejectRequest` from legacy `PUT /rh/demandes/{id}/statut` to typed PATCH endpoints (§5 #8). _~3 hours._
4. **`F4`** Add `/app/admin/system-health` page consuming `/api/v1/ai/health/deep` + per-service `/actuator/health` (§5 #12). _~3 hours._
5. **`F5`** Surface `unwrap()` failures as toasts instead of silent empty state (§7 RH dashboard). _~1 hour._
6. **`F6`** Disable document approve button until document URL is uploaded (§10). _~1 hour._

### C. Database / migrations

1. **`D1`** Flyway `V20__attendance_sessions_timezone.sql` for B6. _~1 hour._
2. **`D2`** Optional: one-off SQL to backfill `utilisateurs.manager_id` from `equipes.responsable_id` where null (§8, §9). _~1 hour._
3. **`D3`** No destructive migrations. No reset.

### D. Chatbot / AI tools (the AI-FE-07 follow-up)

1. **`AI1`** Register `organisation.create_team`, `organisation.create_department` tools in `ai-service/app/tools/`. Backend already exists; this is wiring only (§6 RH). _~2 hours._
2. **`AI2`** After B3 ships, register `organisation.assign_employee` tool. _~1 hour._
3. **`AI3`** After B4 ships, register `admin.tenant_diagnostics` tool and verify "Tenant configuration issues" admin prompt returns real diagnostics (§6 ADMIN). _~2 hours._
4. **`AI4`** Register `reunion.list`, `reunion.get` tools wrapping `ReunionController` so "c quoi mon planning" returns real data instead of capability-unavailable (§6 EMPLOYEE meetings). _~2 hours._
5. **`AI5`** Add `communication.send_message` tool with confirmation (currently read-only). Optional, only if product wants chat-from-chatbot. _~3 hours._
6. **`AI6`** AI-FE-07's remaining UI/test work — already covered substantially by AI_FE_05 + FE_AI_06; remaining items: explicit Playwright run, multilingual test matrix expansion, env-flag-gated `CHATBOT_PUBLIC_DEMO` semantics (already implemented as `CHATBOT_PUBLIC_MODE` — name confirmed in `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md`).

**Estimated total**: ~35-40 hours for the full plan; backend is the longest pole.

---

## 12. Risk notes

- **No fake data.** Every chatbot tool must hit a real backend endpoint. Where a backend endpoint doesn't exist (§5 #4, §6 RH assign-employee), the chatbot must return a clear "capability unavailable" message — never a fabricated success.
- **No direct DB writes from frontend or AI service.** The AI service is a thin orchestration layer; all mutations route through Spring controllers which enforce JPA validation, audit logging, and `entreprise_id` isolation.
- **Backend remains the authority.** ToolRegistry role checks are a convenience for early rejection; the Spring `@PreAuthorize` annotations are the security boundary.
- **`CHATBOT_PUBLIC_MODE` is dev-only.** It is gated by an env flag that defaults to `false`; production must never set it true. The flag exempts only 4 paths at the gateway and only when a chatbot metadata blob is present. Confirmed in `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md`.
- **Status enum hazard.** Four migrations (V3/V6/V11/V18) have rewritten `demandes.statut` allowed values. Frontend constants are a known drift risk — audit before shipping any approval-flow change.
- **Cross-service FKs are not enforced.** Deleting a `utilisateurs` row would orphan rows in `rh.demandes`, `presence.attendance_sessions`, `communication.comm_messages`, etc. Always soft-delete users (set `statut='INACTIF'`) — confirmed by `UserController.deleteUser` likely doing a soft delete; verify.
- **Live data state was not inspected.** No postgres MCP available, so all row-count / empty-data hypotheses are derived from migration SQL + entity definitions. A 30-minute pass with `psql` would tighten this report considerably.
- **No UI was tested live.** Playwright was unused because services were not running. The "cards show 0" diagnoses are inferred from code, not observed. Re-run with `ng serve` + all Spring services up before declaring any fix complete.
- **`fix_auth.py` at the project root is unattributed.** It's listed in `git status` as untracked and not part of this analysis. Worth a separate triage — probably a one-off debug script that should be deleted or moved to `scripts/`.

---

## Appendix — Files & references

- Project root: `C:\Users\DELL\Documents\GitHub\weentime_project`
- Backend services: `weentime-backend/services/{auth,config-server,discovery,gateway,organisation,presence,rh,communication}-service`
- Frontend: `weentime-frontend/angular-weentime/src/app/`
- AI service: `ai-service/`
- Prior reports mined: `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md`, `AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md`, `FE_AI_06_CHATBOT_POSITION_FIX_REPORT.md`, `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`, `P4_01_RESPONSE_GUARD_REPORT.md`, `P5_01_MANAGER_RH_APPROVAL_MODERNIZATION_REPORT.md`, `P3_01/02_PROVIDER_ROUTER_*.md`.
- Key files referenced (not exhaustive):
  - `weentime-backend/services/organisation-service/src/main/java/com/weentime/weentimeproject/controller/UserController.java`
  - `weentime-backend/services/rh-service/src/main/java/com/weentime/weentimeapp/controller/RhDashboardCompatibilityController.java`
  - `weentime-frontend/angular-weentime/src/app/features/rh/rh-api.service.ts`
  - `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
  - `ai-service/app/api/chat_v2.py`, `ai-service/app/tools/registry.py`, `ai-service/app/guards/response_guard.py`

Validation commands suggested in the task spec (`npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, service-level `mvn` compile) were **not run** in this analysis session because no code was modified. They should be re-run before merging any of the task-plan items in §11.

END.
