# BACKEND_AI_MAP

Date: 2026-05-18

Source: filesystem inspection of Spring controllers and AI ToolRegistry backend-client calls. This map lists verified endpoints only; missing request/response details are marked as inferred from controller/tool names rather than invented payloads.

Auth model: backend endpoints remain protected by JWT/gateway/backend service auth. The chatbot does not open Spring APIs publicly; AI tools call these endpoints through ToolRegistry and backend authorization.

## Departments

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/organisations/departements` | query params | department list/page | JWT | RH, ADMIN | organisation-service `DepartementController` |
| GET | `/api/v1/organisations/departements/{id}` | path id | department detail | JWT | RH, ADMIN | organisation-service |
| POST | `/api/v1/organisations/departements` | department create body | created department | JWT | RH, ADMIN | organisation-service |
| PATCH | `/api/v1/organisations/departements/{id}` | partial update body | updated department | JWT | RH, ADMIN | organisation-service |
| PUT | `/api/v1/organisations/departements/{id}` | update body | updated department | JWT | RH, ADMIN | organisation-service |
| DELETE | `/api/v1/organisations/departements/{id}` | path id | delete/void response | JWT | RH, ADMIN | organisation-service |
| GET | `/api/v1/structure/departments` | query params | structure department list | JWT | RH, ADMIN | organisation-service `StructureController` |

AI tools: `organisation.list_departments`, `organisation.create_department` use `/organisations/departements` via `BackendClient`.

## Teams

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/organisations/equipes` | query params | team list/page | JWT | RH, ADMIN | organisation-service `EquipeController` |
| GET | `/api/v1/organisations/equipes/{id}` | path id | team detail | JWT | RH, ADMIN | organisation-service |
| POST | `/api/v1/organisations/equipes` | team create body | created team | JWT | RH, ADMIN | organisation-service |
| PATCH | `/api/v1/organisations/equipes/{id}` | partial update body | updated team | JWT | RH, ADMIN | organisation-service |
| PUT | `/api/v1/organisations/equipes/{id}` | update body | updated team | JWT | RH, ADMIN | organisation-service |
| DELETE | `/api/v1/organisations/equipes/{id}` | path id | delete/void response | JWT | RH, ADMIN | organisation-service |
| GET | `/api/v1/organisations/equipes/{id}/members` | path id | team members | JWT | RH, ADMIN, MANAGER if authorized | organisation-service |
| GET | `/api/v1/organisations/equipes/responsable/{id}` | manager id | teams by manager | JWT | RH, ADMIN, MANAGER if authorized | organisation-service |
| GET | `/api/v1/structure/teams` | query params | structure team list | JWT | RH, ADMIN | organisation-service `StructureController` |

AI tools: `organisation.list_teams`, `organisation.create_team` use `/organisations/equipes`.

## Managers

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/structure/managers` | query params | manager list | JWT | RH, ADMIN | organisation-service `StructureController` |
| GET | `/api/v1/organisations/internal/managers/{managerId}/team` | manager id | manager team | service/JWT | internal, MANAGER/RH derived | organisation-service |
| PUT | `/api/v1/organisations/users/{id}/manager` | manager assignment body | updated user | JWT | ADMIN/RH if authorized | organisation-service `UtilisateurController` |
| GET | `/api/v1/users/managers` | query params | manager list | JWT | ADMIN/RH | organisation-service `UserController` |

AI status: no dedicated verified ToolRegistry write tool for RH manager assignment in this task; RH assignment requests return `capability_unavailable` unless a modern tool is added later.

## Employees / Users

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/organisations/users` | query params | user list | JWT | ADMIN/RH if authorized | organisation-service `UtilisateurController` |
| GET | `/api/v1/organisations/users/{id}` | path id | user detail | JWT | ADMIN/RH/self if authorized | organisation-service |
| POST | `/api/v1/organisations/users` | user create body | created user | JWT | ADMIN | organisation-service |
| POST | `/api/v1/organisations/users/register` | registration body | created/registered user | JWT/internal | auth/admin flow | organisation-service |
| GET | `/api/v1/organisations/users/entreprise/{entrepriseId}` | enterprise id | users by enterprise | JWT | ADMIN/RH | organisation-service |
| GET | `/api/v1/organisations/users/entreprise/{entrepriseId}/ids` | enterprise id | user ids | JWT/internal | internal/admin | organisation-service |
| GET | `/api/v1/organisations/users/entreprise/{entrepriseId}/role/{role}/ids` | enterprise id, role | user ids by role | JWT/internal | internal/admin | organisation-service |
| GET | `/api/v1/organisations/users/by-email` | email query | user detail | JWT/internal | auth/internal | organisation-service |
| PATCH | `/api/v1/organisations/users/{id}` | partial body | updated user | JWT | ADMIN/RH if authorized | organisation-service |
| PUT | `/api/v1/organisations/users/{id}` | update body | updated user | JWT | ADMIN/RH if authorized | organisation-service |
| DELETE | `/api/v1/organisations/users/{id}` | path id | delete/void response | JWT | ADMIN | organisation-service |
| GET | `/api/v1/organisations/users/pending` | query params | pending users | JWT | ADMIN/RH | organisation-service |
| PATCH | `/api/v1/organisations/users/{id}/valider` | path id | validated user | JWT | ADMIN/RH if authorized | organisation-service |
| PATCH | `/api/v1/organisations/users/{id}/rejeter` | path id/body | rejected user | JWT | ADMIN/RH if authorized | organisation-service |
| PUT | `/api/v1/organisations/users/{id}/toggle-status` | path id | updated status | JWT | ADMIN | organisation-service |
| GET | `/api/v1/organisations/users/equipe/{id}` | team id | users by team | JWT | RH/ADMIN/MANAGER if authorized | organisation-service |
| GET | `/api/v1/users` | query params | admin/user list | JWT | ADMIN | organisation-service `UserController` |
| GET | `/api/v1/users/me` | none | current profile | JWT | any authenticated user | organisation-service |
| PUT | `/api/v1/users/me` | profile update | updated profile | JWT | self | organisation-service |

AI tools: admin tools use `/users`, `/organisations/users`, `/organisations/entreprises`; RH user creation remains admin-reserved in the chatbot.

## Leave / Conges

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/rh/solde-conges/me/all` | none | leave balances | JWT | EMPLOYEE, MANAGER, RH personal | rh-service `SoldeCongeController` |
| GET | `/api/v1/rh/solde-conges/me` | optional type | leave balance | JWT | current user | rh-service |
| GET | `/api/v1/rh/solde-conges/users/{utilisateurId}` | user id | user balances | JWT | RH/ADMIN | rh-service |
| GET | `/api/v1/rh/solde-conges` | query params | balances list | JWT | RH/ADMIN | rh-service |
| POST | `/api/v1/rh/solde-conges` | balance create body | created balance | JWT | RH/ADMIN | rh-service |
| PUT/PATCH | `/api/v1/rh/solde-conges/{id}` | balance update body | updated balance | JWT | RH/ADMIN | rh-service |
| GET | `/api/v1/rh/conges` | query params | leave list | JWT | RH/ADMIN | rh-service `CongeController` |
| GET | `/api/v1/rh/conges/me` | none/query | current user's leave requests | JWT | current user | rh-service |
| GET | `/api/v1/rh/conges/manager` | query params | manager leave approvals | JWT | MANAGER | rh-service |
| GET | `/api/v1/rh/conges/rh/pending` | query params | RH pending leave | JWT | RH | rh-service |
| GET | `/api/v1/rh/conges/pending` | query params | pending leave | JWT | RH/MANAGER if authorized | rh-service |
| GET | `/api/v1/rh/conges/{id}` | path id | leave request detail | JWT | authorized roles | rh-service |
| POST | `/api/v1/rh/conges` | leave request body | created leave request | JWT | EMPLOYEE/MANAGER/RH personal | rh-service |
| PATCH | `/api/v1/rh/conges/{id}/valider` or `/{id}/validate-manager` | decision body | manager decision | JWT | MANAGER | rh-service |
| PATCH | `/api/v1/rh/conges/{id}/valider-rh` or `/{id}/validate-rh` | decision body | RH decision | JWT | RH | rh-service |
| PATCH | `/api/v1/rh/conges/{id}/refuser`, `/{id}/refuser-rh`, `/{id}/reject` | reason body | rejected request | JWT | MANAGER/RH | rh-service |
| PATCH | `/api/v1/rh/conges/{id}/cancel` | path id | canceled request | JWT | owner/authorized | rh-service |

AI tools: `leave.get_balance`, `leave.list_my_requests`, `leave.list_manager_requests`, `leave.list_rh_pending`, `leave.get_request_status`, `leave.create_request`, decision tools.

## Attendance / Pointage / Presence

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| POST | `/api/v1/presence/check-in`, `/api/v1/presence/me/check-in` | optional payload | check-in result | JWT | current user | presence-service `PresenceController` |
| POST | `/api/v1/presence/check-out`, `/api/v1/presence/me/check-out` | optional payload | check-out result | JWT | current user | presence-service |
| GET | `/api/v1/presence/today`, `/api/v1/presence/me/today` | none | today's status | JWT | current user | presence-service |
| GET | `/api/v1/presence/active-session` | none | active session | JWT | current user | presence-service |
| GET | `/api/v1/presence/history`, `/api/v1/presence/me/history` | date query | attendance history | JWT | current user | presence-service |
| GET | `/api/v1/presence/team/today`, `/api/v1/presence/manager/team` | query params | team presence | JWT | MANAGER | presence-service |
| GET | `/api/v1/presence/team/history` | query params | team history | JWT | MANAGER | presence-service |
| GET | `/api/v1/presence/company/today` | query params | company presence | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/presence/company/stats` | query params | company stats | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/presence/global/analytics` | query params | global analytics | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/presence/stats`, `/api/v1/presence/me/stats` | none/query | current user's stats | JWT | current user | presence-service |
| POST | `/api/v1/presences/pointages` | compatibility check-in body | pointage result | JWT | current user | presence-service `PointageCompatibilityController` |
| POST | `/api/v1/presences/pointages/checkout` | compatibility checkout body | checkout result | JWT | current user | presence-service |
| GET | `/api/v1/presences/pointages/status` | none/query | pointage status | JWT | current user | presence-service |
| GET | `/api/v1/presences/pointages/week` | query params | weekly hours | JWT | current user | presence-service |

AI tools: `get_pointage_status`, `check_in`, `check_out`, `get_presence_history`, `get_week_hours`, `get_team_presence`. RH explicit checkout now reads status first and does not create checkout confirmation if no entry exists.

## Telework

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET/POST | `/api/v1/rh/teletravail` | query or request body | list/create telework | JWT | employee/RH by authorization | rh-service `TeletravailController` |
| GET | `/api/v1/rh/teletravail/{id}` | path id | telework detail | JWT | authorized roles | rh-service |
| GET | `/api/v1/rh/teletravail/mes-demandes` | none | current user's requests | JWT | current user | rh-service |
| GET | `/api/v1/rh/teletravail/quota` | none/query | current quota | JWT | current user | rh-service |
| GET | `/api/v1/rh/teletravail/quota/utilisateur/{id}` | user id | user quota | JWT | RH/ADMIN | rh-service |
| PUT | `/api/v1/rh/teletravail/{id}/annuler` | path id | canceled request | JWT | owner/authorized | rh-service |
| GET | `/api/v1/rh/teletravail/demandes-equipe` | query params | manager team requests | JWT | MANAGER | rh-service |
| GET | `/api/v1/rh/teletravail/en-attente-rh` | query params | RH pending requests | JWT | RH | rh-service |
| GET | `/api/v1/rh/teletravail/historique-global` | query params | global history | JWT | RH | rh-service |
| GET | `/api/v1/rh/teletravail/stats-rh` | query params | RH telework stats | JWT | RH | rh-service |
| PATCH | `/api/v1/rh/teletravail/{id}/valider-manager` | decision body | manager approval | JWT | MANAGER | rh-service |
| PATCH | `/api/v1/rh/teletravail/{id}/rejeter-manager` | reason body | manager rejection | JWT | MANAGER | rh-service |
| PATCH | `/api/v1/rh/teletravail/{id}/valider-rh` | decision body | RH approval | JWT | RH | rh-service |
| PATCH | `/api/v1/rh/teletravail/{id}/rejeter-rh` | reason body | RH rejection | JWT | RH | rh-service |

AI tools: `telework.create_request`, `telework.list_my_requests`, `telework.list_manager_requests`, `telework.list_rh_pending`, `telework.get_status`, decision tools.

## Authorizations

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET/POST | `/api/v1/rh/autorisations` | query or authorization request body | list/create authorization | JWT | current user/RH | rh-service `AutorisationController` |
| GET | `/api/v1/rh/autorisations/me` | query params | current user's requests | JWT | current user | rh-service |
| GET | `/api/v1/rh/autorisations/manager` | query params | manager approvals | JWT | MANAGER | rh-service |
| GET | `/api/v1/rh/autorisations/my-history` | query params | current history | JWT | current user | rh-service |
| GET | `/api/v1/rh/autorisations/manager/history` | query params | manager history | JWT | MANAGER | rh-service |
| GET | `/api/v1/rh/autorisations/rh/history` | query params | RH history/list | JWT | RH | rh-service |
| GET | `/api/v1/rh/autorisations/kpis/employee` | query params | employee KPIs | JWT | current user | rh-service |
| GET | `/api/v1/rh/autorisations/kpis/manager` | query params | manager KPIs | JWT | MANAGER | rh-service |
| GET | `/api/v1/rh/autorisations/kpis/rh` | query params | RH KPIs | JWT | RH | rh-service |
| PATCH | `/api/v1/rh/autorisations/{id}/manager/validate` or `/{id}/validate/manager` | decision body | manager validation | JWT | MANAGER | rh-service |
| PATCH | `/api/v1/rh/autorisations/{id}/rh/validate` or `/{id}/validate/rh` | decision body | RH validation | JWT | RH | rh-service |
| PATCH | `/api/v1/rh/autorisations/{id}/reject` or `/{id}/refuser` | reason body | rejected authorization | JWT | MANAGER/RH | rh-service |
| PATCH | `/api/v1/rh/autorisations/{id}/cancel` | path id | canceled authorization | JWT | owner/authorized | rh-service |
| GET | `/api/v1/rh/autorisations/{id}` | path id | authorization detail | JWT | authorized roles | rh-service |

AI tools: `authorization.create_request`, `authorization.list_my_requests`, `authorization.list_manager_requests`, `authorization.list_rh_requests`, `authorization.get_status`, decision tools.

## Schedules / Horaires

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/horaires` | query params | schedule list | JWT | RH/ADMIN/MANAGER if authorized | presence-service `HoraireController` |
| GET | `/api/v1/horaires/{id}` | path id | schedule detail | JWT | authorized roles | presence-service |
| POST | `/api/v1/horaires` | schedule create body | created schedule | JWT | RH/ADMIN | presence-service |
| PUT | `/api/v1/horaires/{id}` | update body | updated schedule | JWT | RH/ADMIN | presence-service |
| DELETE | `/api/v1/horaires/{id}` | path id | delete/void response | JWT | RH/ADMIN | presence-service |
| POST | `/api/v1/horaires/assign` | assignment body | created assignment | JWT | RH/ADMIN | presence-service |
| POST | `/api/v1/horaires/assign/batch` | batch assignment body | created assignments | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/horaires/assign` | query params | assignments | JWT | RH/ADMIN/MANAGER if authorized | presence-service |
| DELETE | `/api/v1/horaires/assign/{id}` | path id | removed assignment | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/horaires/assign/check-chevauchement` | query params | overlap check | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/horaires/resolve` | query params | resolved schedule | JWT | authenticated | presence-service |
| GET | `/api/v1/horaires/team` | query params | team schedules | JWT | MANAGER/RH | presence-service |

AI tools: new `schedule.list` read-only tool calls `/horaires`. Schedule create/assign remain clarification/capability flows until write tools are registered.

## Planning

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/rh/planning` | query params | RH planning view | JWT | RH | rh-service `RhPlanningController` |
| POST | `/api/v1/rh/planning/bulk-status` | bulk request body | bulk planning status | JWT | RH | rh-service |
| POST | `/api/v1/rh/planning/notify` | notification body | notification result | JWT | RH | rh-service |
| GET | `/api/v1/rh/planning/is-excused` | query params | excused status | JWT/internal | RH/internal | rh-service |

AI status: no dedicated RH planning ToolRegistry tool was registered in this task. Unconnected planning writes remain unavailable.

## Meetings / Reunions

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| POST | `/api/v1/rh/reunions` | meeting create body | created meeting | JWT | authorized roles | rh-service `ReunionController` |
| GET | `/api/v1/rh/reunions/mes-reunions` | query params | current user's meetings | JWT | current user | rh-service |
| GET | `/api/v1/rh/reunions/prochaine` | none/query | next meeting | JWT | current user | rh-service |
| GET | `/api/v1/rh/reunions/{uuid}` | meeting uuid | meeting detail | JWT | participant/authorized | rh-service |
| PATCH | `/api/v1/rh/reunions/{uuid}/repondre` | response body | RSVP result | JWT | participant | rh-service |
| PATCH | `/api/v1/rh/reunions/{uuid}/cloturer` | path uuid | closed meeting | JWT | organizer/authorized | rh-service |
| PATCH | `/api/v1/rh/reunions/{uuid}/annuler` | path uuid | canceled meeting | JWT | organizer/authorized | rh-service |
| GET | `/api/v1/rh/reunions/conflits` | query params | conflict list | JWT | authorized roles | rh-service |
| GET | `/api/v1/rh/reunions/internal/minutes-today` | none/query | internal minutes | internal | internal | rh-service |

AI tools: `reunion.list_mine`, `reunion.next`, `reunion.get`. Meeting creation is not wired to chatbot write execution in this task.

## Documents

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| POST | `/api/v1/documents` | document request body | created request | JWT | current user | rh-service `DocumentController` |
| GET | `/api/v1/documents/mes-demandes` | query params | current user's document requests | JWT | current user | rh-service |
| PUT | `/api/v1/documents/{id}/annuler` | path id | canceled request | JWT | owner/authorized | rh-service |
| GET | `/api/v1/documents/{id}/telecharger` | path id | file/download response | JWT | owner/authorized | rh-service |
| PUT | `/api/v1/documents/{id}/statut` | status body | updated status | JWT | RH/ADMIN | rh-service |
| GET | `/api/v1/documents/rh/demandes` | query params | RH document workload | JWT | RH | rh-service |
| GET | `/api/v1/documents/rh/stats` | query params | RH document stats | JWT | RH | rh-service |
| PUT | `/api/v1/documents/{id}/passer-en-cours` | path id | in-progress status | JWT | RH | rh-service |
| PUT | `/api/v1/documents/{id}/valider` | body/path | validated document | JWT | RH | rh-service |
| POST | `/api/v1/documents/{id}/upload` | multipart file | uploaded document | JWT | RH | rh-service |
| PUT | `/api/v1/documents/{id}/refuser` | reason body | refused document | JWT | RH | rh-service |
| GET | `/api/v1/documents/{id}/file` | path id | document file | JWT | owner/RH | rh-service |
| POST | `/api/v1/documents/rh/generate-ai` | document generation body | generated document request/result | JWT | RH | rh-service |

AI tools: `document.create_request`, `document.list_my_requests`, `document.open`, `document.rh_workload`, `document.rh_generate`, `document.rh_reject`.

## Messages / Communication

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/communication/channels` | query params | visible channels | JWT | authenticated | communication-service `ChannelController` |
| GET | `/api/v1/communication/channels/{channelId}` | channel id | channel detail | JWT | channel member/authorized | communication-service |
| POST | `/api/v1/communication/channels` | channel create body | created channel | JWT | authorized roles | communication-service |
| POST | `/api/v1/communication/direct` | direct message/channel body | DM channel/result | JWT | authenticated | communication-service |
| POST | `/api/v1/communication/channels/{channelId}/read` | channel id | read marker | JWT | channel member | communication-service |
| GET | `/api/v1/communication/unread-summary` | query params | unread summary | JWT | authenticated | communication-service |
| GET | `/api/v1/communication/channels/{channelId}/messages` | query params | message list | JWT | channel member | communication-service `MessageController` |
| POST | `/api/v1/communication/channels/{channelId}/messages` | message body | created message | JWT | channel member | communication-service |
| PUT | `/api/v1/communication/messages/{messageId}` | message update body | updated message | JWT | author/authorized | communication-service |
| DELETE | `/api/v1/communication/messages/{messageId}` | path id | deleted message | JWT | author/authorized | communication-service |
| POST | `/api/v1/communication/attachments` | multipart file | uploaded attachment | JWT | authenticated | communication-service |
| GET | `/api/v1/communication/attachments/{id}/download` | path id | attachment download | JWT | authorized | communication-service |
| GET | `/api/v1/communication/events/replay` and `/events/missed` | query params | missed/replayed events | JWT | authenticated | communication-service |

AI tools: `communication.list_channels`, `communication.get_channel_messages`, `communication.send_message`, communication digest reads.

## Analytics

| Method | Endpoint | Request | Response | Auth | Role | Service owner |
|---|---|---|---|---|---|---|
| GET | `/api/v1/rh/stats` | query params | RH stats | JWT | RH, ADMIN if supported | rh-service `RhDashboardCompatibilityController` |
| GET | `/api/v1/rh/dashboard` | query params | RH dashboard | JWT | RH | rh-service |
| GET | `/api/v1/rh/stats/evolution-mensuelle` | query params | monthly evolution | JWT | RH | rh-service |
| GET | `/api/v1/rh/stats/demandes-par-type` | query params | requests by type | JWT | RH | rh-service |
| GET | `/api/v1/presence/company/stats` | query params | company attendance stats | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/presence/global/analytics` | query params | global presence analytics | JWT | RH/ADMIN | presence-service |
| GET | `/api/v1/documents/rh/stats` | query params | document stats | JWT | RH | rh-service |
| GET | `/api/v1/rh/teletravail/stats-rh` | query params | telework stats | JWT | RH | rh-service |

AI tools: `rh.get_stats`, `document.rh_workload`, `get_team_presence`, telework/leave/authorization read aggregation. Predictive analytics remain unavailable unless verified endpoints/tools are added.
