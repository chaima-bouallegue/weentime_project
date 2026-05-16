# Backend Capability Map

**Generated:** 2026-05-16
**Scope:** all public + internal REST controllers across 5 Spring services
**Purpose:** source of truth for ai-service agents — drives "real call" vs `capability_unavailable` decisions.

## Conventions
- AI readiness column values: **ready** | **partial** | **missing** | **unavailable**
  - ready    = AI tool exists, payload shapes match, currently called.
  - partial  = AI tool exists but missing fields, mis-mapped, or role-restricted.
  - missing  = endpoint exists, no AI tool — agent should return `capability_unavailable` until added.
  - unavailable = endpoint does not exist at all (no row in this doc; this value is used by agents that reference this map, not by rows here).
- Internal-only controllers (`Internal*Controller.java`) are listed under a sub-heading and excluded from the AI readiness analysis (they are service-to-service, called by other Spring services with `X-Internal-Service-Key`).
- The ai-service `backend_client.build_url()` strips a leading `/api/v1` prefix from tool paths, so the table's `path` column shows the canonical Spring base path; AI tools call the same URL minus the `/api/v1` prefix.

---

## auth-service

### AuthController
**Base path:** `/api/v1/auth`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/auth/login | (none — open) | Authenticate with email+password, may return 2FA temp token | LoginRequest / ApiResponse<JwtResponse> | — | missing | Login is intentionally unauthenticated; AI does not log users in. |
| POST | /api/v1/auth/verify-2fa | (none — open) | Verify 2FA TOTP / email OTP / backup code | Verify2faRequest / ApiResponse<JwtResponse> | — | missing | n/a for AI |
| POST | /api/v1/auth/2fa/setup | (none — class default; uses Authentication arg) | Initiate 2FA enrollment (TOTP or email) | type query param / ApiResponse<Map> | — | missing | Implicit auth via Authentication injection; flag in Gap notes. |
| POST | /api/v1/auth/2fa/confirm | (none — class default; uses Authentication arg) | Confirm 2FA enrollment | Map<String,String> / ApiResponse<Map> | — | missing | Implicit auth only. |
| POST | /api/v1/auth/2fa/disable | (none — class default; uses Authentication arg) | Disable 2FA | — / ApiResponse<Void> | — | missing | Implicit auth only. |
| POST | /api/v1/auth/admin/create-rh | hasRole('ADMIN') | Create an RH user (admin only) | CreateRhRequest / ApiResponse<CreateRhResponse> | — | missing | Not yet wrapped; admin.create_user uses organisation-service `/users` instead. |
| POST | /api/v1/auth/register | (none — open) | Self-register; may return INSCRIPTION_PENDING | RegisterRequest / ApiResponse<RegisterResponse> | — | missing | n/a for AI |
| GET | /api/v1/auth/validate | (none — open) | Validate a JWT | token query / ApiResponse<String> | — | missing | n/a for AI |

### HealthController
**Base path:** (none — root)

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /health | (none — open) | Liveness probe | — / Map<String,Object> | — | missing | n/a (infra) |

---

## organisation-service

### Public controllers

#### DepartementController
**Base path:** `/api/v1/organisations/departements`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/organisations/departements | hasAnyAuthority('ROLE_ADMIN','ROLE_RH') | Create department | DepartementRequest / DepartementResponse | organisation.create_department | ready | |
| GET | /api/v1/organisations/departements/{id} | ROLE_ADMIN/RH/MANAGER | Get department by id | — / DepartementResponse | — | missing | |
| GET | /api/v1/organisations/departements | ROLE_ADMIN/RH/MANAGER | List departments (paged) | PageParams / Page<DepartementResponse> | organisation.list_departments | ready | |
| PATCH | /api/v1/organisations/departements/{id} | ROLE_ADMIN/RH | Update department (partial) | DepartementRequest / DepartementResponse | — | missing | |
| PUT | /api/v1/organisations/departements/{id} | ROLE_ADMIN/RH | Replace department | DepartementRequest / DepartementResponse | — | missing | |
| DELETE | /api/v1/organisations/departements/{id} | ROLE_ADMIN/RH | Delete department | — / Void | — | missing | |

#### NotificationController
**Base path:** `/api/v1/notifications`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/notifications | isAuthenticated() | List my notifications | — / List<NotificationResponse> | — | missing | |
| GET | /api/v1/notifications/unread-count | isAuthenticated() | Unread badge count | — / UnreadCountResponse | — | missing | |
| PATCH | /api/v1/notifications/{id}/read | isAuthenticated() | Mark one as read | — / NotificationResponse | — | missing | |
| PATCH | /api/v1/notifications/read-all | isAuthenticated() | Mark all as read | — / List<NotificationResponse> | — | missing | |

#### PresenceController (organisation-service)
**Base path:** `/api/v1/presences`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/presences/check-in | isAuthenticated() | Personal check-in (legacy org-side) | — / PresenceResponse | check_in | partial | compat shim of presence-service `PresenceController`; AI tool calls presence-service `/presence/me/check-in` instead. |
| POST | /api/v1/presences/check-out | isAuthenticated() | Personal check-out (legacy) | — / PresenceResponse | check_out | partial | compat shim of presence-service `PresenceController`. |
| GET | /api/v1/presences/me/today | isAuthenticated() | Today summary (legacy) | — / PresenceResponse | get_pointage_status | partial | compat shim of presence-service `PresenceController`. |
| GET | /api/v1/presences/me/history | isAuthenticated() | History list (legacy) | — / List<PresenceResponse> | get_presence_history | partial | compat shim of presence-service `PresenceController`. |

#### PublicOrganisationController
**Base path:** `/api/v1/organisations`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/organisations/by-code/{code} | (none — open) | Resolve enterprise by invitation code | — / EntrepriseResponse | — | missing | Open by design (pre-registration). |

#### RoleController
**Base path:** `/api/v1/organisations/roles`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/organisations/roles | hasRole('ADMIN') | Create role | RoleRequest / RoleResponse | — | missing | |
| GET | /api/v1/organisations/roles/{id} | hasAnyRole('ADMIN','RH') | Get role | — / RoleResponse | — | missing | |
| GET | /api/v1/organisations/roles | hasAnyRole('ADMIN','RH') | List roles | — / List<RoleResponse> | — | missing | |
| PUT | /api/v1/organisations/roles/{id} | hasRole('ADMIN') | Update role | RoleRequest / RoleResponse | — | missing | |
| DELETE | /api/v1/organisations/roles/{id} | hasRole('ADMIN') | Delete role | — / Void | — | missing | |

#### StructureController
**Base path:** `/api/v1/structure`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/structure/departments | ROLE_RH/ADMIN/MANAGER | Department tree | — / List<StructureDepartmentResponse> | — | missing | Distinct from `/organisations/departements`; richer tree shape. |
| GET | /api/v1/structure/teams | ROLE_RH/ADMIN/MANAGER | Teams list (structure view) | — / List<StructureTeamResponse> | — | missing | |
| GET | /api/v1/structure/managers | ROLE_RH/ADMIN | Manager directory | — / List<StructureEmployeeResponse> | — | missing | |
| GET | /api/v1/structure/employees | ROLE_RH/ADMIN/MANAGER | Employee directory | — / List<StructureEmployeeResponse> | — | missing | |

#### UserIntegrationController
**Base path:** `/api/users`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/users/{id} | (none — open) | Integration view of user | — / UserIntegrationResponse | — | missing | **Open endpoint, no auth annotation — tenant-isolation risk; flag for review.** |
| GET | /api/users/{id}/manager | (none — open) | Resolve user's manager | — / UserIntegrationResponse | — | missing | **Open endpoint.** |
| GET | /api/users/{id}/roles | (none — open) | Resolve user roles | — / List<String> | — | missing | **Open endpoint.** |

#### RhManagementController
**Base path:** `/api/v1/organisations/rh` (also `/api/v1/organisations/rh-owners`)

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/organisations/rh | hasRole('ADMIN') | List all RH owners | — / ApiResponse<List<RhOwnerResponse>> | — | missing | |
| GET | /api/v1/organisations/rh/entreprise/{entrepriseId} | hasRole('ADMIN') | RH owners for enterprise | — / ApiResponse<List<RhOwnerResponse>> | — | missing | |
| POST | /api/v1/organisations/rh | hasRole('ADMIN') | Create RH owner | RhOwnerCreateRequest / ApiResponse<RhOwnerResponse> | — | missing | |
| PUT | /api/v1/organisations/rh/{id} | hasRole('ADMIN') | Update RH owner | RhOwnerUpdateRequest / ApiResponse<RhOwnerResponse> | — | missing | |
| DELETE | /api/v1/organisations/rh/{id} | hasRole('ADMIN') | Delete RH owner | — / ApiResponse<Void> | — | missing | |
| PUT | /api/v1/organisations/rh/{id}/assign-entreprise | hasRole('ADMIN') | Assign enterprise to RH | RhOwnerAssignEntrepriseRequest / ApiResponse<RhOwnerResponse> | admin.assign_rh_owner | ready | |
| PATCH | /api/v1/organisations/rh/{id}/toggle-statut | hasRole('ADMIN') | Toggle RH active flag | — / ApiResponse<RhOwnerResponse> | — | missing | |

#### UserController
**Base path:** `/api/v1/users`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/users | hasAnyRole('ADMIN','RH') | List users (paged, filterable) | PageParams + filters / Page<UserManagementResponse> | admin.list_users | ready | |
| GET | /api/v1/users/{id} | hasAnyRole('ADMIN','RH') | Get user by id | — / UserManagementResponse | — | missing | |
| POST | /api/v1/users | hasAnyRole('ADMIN','RH') | Create user (canonical) | UserManagementRequest / UserManagementResponse | admin.create_user | ready | |
| PUT | /api/v1/users/{id} | hasAnyRole('ADMIN','RH') | Update user | UserManagementRequest / UserManagementResponse | — | missing | admin.update_user_role uses `/organisations/users/{id}` PATCH instead. |
| DELETE | /api/v1/users/{id} | hasAnyRole('ADMIN','RH') | Delete user | — / Void | — | missing | |
| GET | /api/v1/users/roles | hasAnyRole('ADMIN','RH') | Role lookup options | — / List<String> | — | missing | |
| GET | /api/v1/users/statuses | hasAnyRole('ADMIN','RH') | Status lookup options | — / List<String> | — | missing | |
| GET | /api/v1/users/companies | hasAnyRole('ADMIN','RH') | Company lookup options | — / List<LookupOptionResponse> | — | missing | |
| GET | /api/v1/users/departments | hasAnyRole('ADMIN','RH') | Department lookup options | companyId? / List<LookupOptionResponse> | — | missing | |
| GET | /api/v1/users/teams | hasAnyRole('ADMIN','RH') | Team lookup options | departmentId? / List<LookupOptionResponse> | — | missing | |
| GET | /api/v1/users/managers | hasAnyRole('ADMIN','RH') | Manager lookup options | companyId? / List<LookupOptionResponse> | — | missing | |
| GET | /api/v1/users/me | (none — class default; method-level missing) | Current user profile | — / UserProfileResponse | — | missing | **No @PreAuthorize; relies on filter-level auth — flag.** |
| PUT | /api/v1/users/me | (none — method-level missing) | Update my profile | UserProfileUpdateRequest / UserProfileResponse | — | missing | **No @PreAuthorize.** |
| POST | /api/v1/users/me/avatar | (none — method-level missing) | Upload my avatar | multipart "avatar" / Map<String,String> | — | missing | **No @PreAuthorize.** |
| GET | /api/v1/users/avatar/{filename:.+} | (none — open) | Serve avatar binary | — / Resource | — | missing | Static asset. |
| PUT | /api/v1/users/me/password | (none — method-level missing) | Change password | ChangePasswordRequest / Void | — | missing | **No @PreAuthorize.** |
| GET | /api/v1/users/me/activity (+ alt paths /me/activity-log, /me/user-activity, /activity-log, /user-activity) | (none — method-level missing) | Activity history | — / List<ActivityItemResponse> | — | missing | Five-way aliased; **no @PreAuthorize**. |

#### EntrepriseController
**Base path:** `/api/v1/organisations/entreprises`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/organisations/entreprises | hasRole('ADMIN') | Create enterprise | EntrepriseRequest / EntrepriseResponse | — | missing | |
| GET | /api/v1/organisations/entreprises/{id} | hasAnyRole('ADMIN','RH','MANAGER') | Get enterprise | — / EntrepriseResponse | — | missing | |
| GET | /api/v1/organisations/entreprises | hasAnyRole('ADMIN','RH','MANAGER') | List enterprises (paged) | PageParams / Page<EntrepriseResponse> | admin.list_enterprises | ready | |
| PATCH | /api/v1/organisations/entreprises/{id} | hasRole('ADMIN') | Patch enterprise | EntrepriseRequest / EntrepriseResponse | — | missing | |
| PUT | /api/v1/organisations/entreprises/{id} | hasRole('ADMIN') | Replace enterprise | EntrepriseRequest / EntrepriseResponse | — | missing | |
| DELETE | /api/v1/organisations/entreprises/{id} | hasRole('ADMIN') | Delete enterprise | — / Void | — | missing | |
| GET | /api/v1/organisations/entreprises/validate-code/{code} | (none — open) | Validate invitation code | — / Object\|Map | — | missing | Open by design. |
| POST | /api/v1/organisations/entreprises/{id}/regenerate-code | hasRole('ADMIN') | Regenerate invitation code | — / EntrepriseResponse | — | missing | |
| GET | /api/v1/organisations/entreprises/by-code/{code} | (none — open) | Resolve enterprise by code (duplicate of PublicOrganisationController) | — / EntrepriseResponse | — | missing | compat shim of `PublicOrganisationController.getByCode`. |

#### EquipeController
**Base path:** `/api/v1/organisations/equipes`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/organisations/equipes | hasAnyAuthority('ROLE_ADMIN','ROLE_RH') | Create team | EquipeRequest / EquipeResponse | organisation.create_team | ready | |
| GET | /api/v1/organisations/equipes/{id} | ROLE_ADMIN/RH/MANAGER | Get team | — / EquipeResponse | — | missing | |
| GET | /api/v1/organisations/equipes | ROLE_ADMIN/RH/MANAGER | List teams (paged) | PageParams / Page<EquipeResponse> | organisation.list_teams | ready | |
| PATCH | /api/v1/organisations/equipes/{id} | ROLE_ADMIN/RH | Patch team | EquipeRequest / EquipeResponse | — | missing | |
| PUT | /api/v1/organisations/equipes/{id} | ROLE_ADMIN/RH | Replace team | EquipeRequest / EquipeResponse | — | missing | |
| DELETE | /api/v1/organisations/equipes/{id} | ROLE_ADMIN/RH | Delete team | — / Void | — | missing | |
| GET | /api/v1/organisations/equipes/{id}/members | ROLE_RH/MANAGER/ADMIN | Team members (paged) | PageParams / Page<?> | — | missing | |
| GET | /api/v1/organisations/equipes/responsable/{id} | ROLE_ADMIN/RH/MANAGER | Teams led by responsable | — / List<EquipeResponse> | — | missing | |

#### UtilisateurController
**Base path:** `/api/v1/organisations/users`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/organisations/users | hasAnyRole('ADMIN','RH') | Create user (legacy DTO shape) | UtilisateurRequest / UtilisateurResponse | — | missing | compat shim of `UserController.createUser`. |
| POST | /api/v1/organisations/users/register | (none — open) | Self-register | RegisterRequest / UtilisateurResponse | — | missing | Open by design. |
| GET | /api/v1/organisations/users/{id} | hasAnyRole + self | Get user by id | — / UtilisateurResponse | admin.update_user_role (read step) | ready | Used by admin tool to pre-load before PATCH. |
| GET | /api/v1/organisations/users/entreprise/{entrepriseId} | (none — method-level missing) | Users in enterprise | — / List<UtilisateurResponse> | — | missing | **No @PreAuthorize on method or class.** |
| GET | /api/v1/organisations/users/entreprise/{entrepriseId}/ids | (none — method-level missing) | User ids in enterprise | — / List<Long> | — | missing | **No auth.** |
| GET | /api/v1/organisations/users/entreprise/{entrepriseId}/role/{role}/ids | (none — method-level missing) | User ids by enterprise+role | — / List<Long> | — | missing | **No auth.** |
| GET | /api/v1/organisations/users/by-email | hasAnyRole('RH','MANAGER','ADMIN') | Lookup user by email | email query / UtilisateurResponse | — | missing | |
| GET | /api/v1/organisations/users/auth/by-email | (none — open) | Internal auth lookup | email query / UtilisateurAuthResponse | — | missing | **No auth — used by auth-service via Feign; should be internal-only.** |
| GET | /api/v1/organisations/users | hasAnyRole('ADMIN','RH','MANAGER','EMPLOYEE') | List users (paged) | PageParams + entrepriseId / Page<UtilisateurResponse> | admin.misconfigured_users | ready | |
| PATCH | /api/v1/organisations/users/{id} | hasAnyRole('ADMIN','RH') | Patch user | UtilisateurRequest / UtilisateurResponse | admin.update_user_role | ready | |
| PUT | /api/v1/organisations/users/{id} | hasAnyRole('ADMIN','RH') | Replace user | UtilisateurRequest / UtilisateurResponse | — | missing | |
| DELETE | /api/v1/organisations/users/{id} | hasAnyRole('ADMIN','RH') | Delete user | — / Void | — | missing | |
| GET | /api/v1/organisations/users/pending | hasAnyRole('ADMIN','RH') | List PENDING users | — / List<UtilisateurResponse> | — | missing | |
| PATCH | /api/v1/organisations/users/{id}/valider | hasAnyRole('ADMIN','RH') | Validate pending user | ValidationRequest? / UtilisateurResponse | — | missing | |
| PATCH | /api/v1/organisations/users/{id}/rejeter | hasAnyRole('ADMIN','RH') | Reject pending user | — / UtilisateurResponse | — | missing | |
| PUT | /api/v1/organisations/users/{id}/toggle-status | hasAnyRole('ADMIN','RH') | Toggle ACTIF/INACTIF | — / UtilisateurResponse | — | missing | |
| PUT | /api/v1/organisations/users/{id}/manager | hasAnyRole('ADMIN','RH') | Assign manager | managerId? query / UtilisateurResponse | admin.assign_manager | ready | |
| POST | /api/v1/organisations/users/2fa/update | (none — method-level missing) | Internal 2FA settings update | email/enabled/type/secret query / Void | — | missing | **No auth — Feign-only; should be internal-only.** |
| POST | /api/v1/organisations/users/2fa/backup-codes | (none — method-level missing) | Internal: persist hashed backup codes | email query, List<String> body / Void | — | missing | **No auth — Feign-only.** |
| POST | /api/v1/organisations/users/2fa/failure | (none — method-level missing) | Internal: record 2FA failure | email query / Map<String,Object> | — | missing | **No auth.** |
| POST | /api/v1/organisations/users/2fa/reset | (none — method-level missing) | Internal: reset 2FA attempts | email query / Void | — | missing | **No auth.** |
| GET | /api/v1/organisations/users/equipe/{id} | hasAnyRole('ADMIN','RH','MANAGER') | Users in team | — / List<UtilisateurResponse> | — | missing | |

### Internal controllers (organisation-service)

#### InternalUtilisateurController
**Base path:** `/api/v1/organisations/internal`. No `@PreAuthorize` (service-to-service).

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| POST | /api/v1/organisations/internal/create-rh | Create RH (called by auth-service) | CreateRhRequest / CreateRhResponse | n/a — internal |
| GET | /api/v1/organisations/internal/users/{id}/summary | User summary | — / UserSummaryResponse | n/a — internal |
| POST | /api/v1/organisations/internal/users/summaries | Bulk user summaries | Collection<Long> / List<UserSummaryResponse> | n/a — internal |
| GET | /api/v1/organisations/internal/users/{id}/manager | Manager of user | — / UserSummaryResponse | n/a — internal |
| GET | /api/v1/organisations/internal/users/{id}/roles | Roles of user | — / List<String> | n/a — internal |
| GET | /api/v1/organisations/internal/managers/{managerId}/team | Team members of manager | — / List<UserSummaryResponse> | n/a — internal |
| GET | /api/v1/organisations/internal/users/active | All active users | — / List<UserSummaryResponse> | n/a — internal |

#### InternalCommunicationSyncController
**Base path:** `/api/v1/organisations/internal`. Validates `X-Internal-Service-Key` header.

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| GET | /api/v1/organisations/internal/sync/enterprises/{entrepriseId} | Enterprise snapshot for communication-service | — / CommunicationSyncEnterpriseResponse | n/a — internal |

#### InternalCommunicationNotificationController
**Base path:** `/api/v1/organisations/internal/notifications`. Validates `X-Internal-Service-Key`.

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| POST | /api/v1/organisations/internal/notifications/users/{userId} | Push notification to user | NotificationDispatchRequest / Void | n/a — internal |

#### InternalNotificationController
**Base path:** `/api/v1/notifications/internal`. **No internal-key validator and no @PreAuthorize — flag for review.**

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| POST | /api/v1/notifications/internal/users/{userId} | Send notification to one user | NotificationDispatchRequest / Void | n/a — internal **(open)** |
| POST | /api/v1/notifications/internal/roles/{role} | Send notification to a role | NotificationDispatchRequest / Void | n/a — internal **(open)** |
| POST | /api/v1/notifications/internal/managers/{managerId} | Send notification to a manager | NotificationDispatchRequest / Void | n/a — internal **(open)** |
| POST | /api/v1/notifications/internal/rh | Send notification to all RH | NotificationDispatchRequest / Void | n/a — internal **(open)** |

---

## presence-service

### Public controllers

#### HealthController (presence-service)
**Base path:** `/api/v1/health`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/health/db | (none — open) | DB liveness probe | — / Map<String,Object> | — | missing | n/a (infra) |

#### HoraireController
**Base path:** `/api/v1/horaires`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/horaires | ROLE_RH/ADMIN | List horaires (paged) | page/size / ApiResponse<Page<HoraireDto>> | — | missing | |
| GET | /api/v1/horaires/{id} | ROLE_RH/ADMIN | Get horaire | — / ApiResponse<HoraireDto> | — | missing | |
| POST | /api/v1/horaires | ROLE_RH/ADMIN | Create horaire | HoraireDto / ApiResponse<HoraireDto> | — | missing | |
| PUT | /api/v1/horaires/{id} | ROLE_RH/ADMIN | Update horaire | HoraireDto / ApiResponse<HoraireDto> | — | missing | |
| DELETE | /api/v1/horaires/{id} | ROLE_RH/ADMIN | Delete horaire | — / Void | — | missing | |
| POST | /api/v1/horaires/assign | ROLE_RH/ADMIN | Assign horaire to target | AssignHoraireRequestDto / ApiResponse<AffectationHoraireDto> | — | missing | |
| POST | /api/v1/horaires/assign/batch | ROLE_RH/ADMIN | Batch assign | AssignHoraireBatchRequestDto / ApiResponse<List<AffectationHoraireDto>> | — | missing | |
| GET | /api/v1/horaires/assign | ROLE_RH/ADMIN | List affectations | page/size / ApiResponse<Page<AffectationHoraireDto>> | — | missing | |
| DELETE | /api/v1/horaires/assign/{id} | ROLE_RH/ADMIN | Delete affectation | — / Void | — | missing | |
| GET | /api/v1/horaires/assign/check-chevauchement | ROLE_RH/ADMIN | Check overlap | CibleType, cibleId, priorite, dates / ApiResponse<CheckChevauchementResponseDto> | — | missing | |
| GET | /api/v1/horaires/resolve | isAuthenticated() | Resolve my (or email's) horaire | email? / ApiResponse<HoraireDto> | — | missing | |
| GET | /api/v1/horaires/team | ROLE_MANAGER | Team schedules | — / ApiResponse<List<EmployeeScheduleDto>> | — | missing | |

#### PresenceController (presence-service)
**Base path:** `/api/v1/presence` (also `/api/v1/presences`, `/api/presence`)

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/presence/check-in (alt /attendance/start, /me/check-in) | EMPLOYEE/MANAGER/RH/ADMIN | Personal check-in | CheckInRequest? / ApiResponse<TodayPresenceResponse> | check_in | ready | AI tool path is `/presence/me/check-in`. |
| POST | /api/v1/presence/check-out (alt /me/check-out) | EMPLOYEE/MANAGER/RH/ADMIN | Personal check-out | CheckOutRequest? / ApiResponse<TodayPresenceResponse> | check_out | ready | AI tool path is `/presence/me/check-out`. |
| GET | /api/v1/presence/today (alt /me/today) | EMPLOYEE/MANAGER/RH/ADMIN | Today summary | — / ApiResponse<TodayPresenceResponse> | get_pointage_status | ready | AI tool path is `/presence/me/today`. |
| GET | /api/v1/presence/active-session (alt /attendance/active-session) | isAuthenticated() | Active session | — / ApiResponse<PresenceSessionResponse> | — | missing | |
| GET | /api/v1/presence/history (alt /me, /me/history) | EMPLOYEE/MANAGER/RH/ADMIN | Paged history | page/size / ApiResponse<PresenceHistoryResponse> | get_presence_history | ready | AI tool path is `/presence/me/history`. |
| GET | /api/v1/presence/team/today (alt /manager/team) | ROLE_MANAGER | Manager team today | teamId? / ApiResponse<TeamStatusResponse> | get_team_presence (MANAGER branch) | ready | |
| GET | /api/v1/presence/team/history | ROLE_MANAGER | Manager team history | teamId/page/size / ApiResponse<Page<AttendanceSessionViewDTO>> | — | missing | |
| GET | /api/v1/presence/company/today | ROLE_RH | RH all-employees today | — / ApiResponse<TeamStatusResponse> | get_team_presence (RH branch) | ready | |
| GET | /api/v1/presence/company/stats | ROLE_RH | RH stats | — / ApiResponse<PresenceStatsDTO> | — | missing | |
| GET | /api/v1/presence/global/analytics | ROLE_ADMIN | Admin analytics | — / ApiResponse<GlobalPresenceAnalyticsDTO> | get_team_presence (ADMIN branch) | ready | |
| GET | /api/v1/presence/stats (alt /me/stats) | EMPLOYEE/MANAGER/RH/ADMIN | Personal or global stats (route-dependent) | — / ApiResponse<PresenceStatsDTO> | get_week_hours | ready | AI tool path is `/presence/me/stats`. |

#### PointageCompatibilityController
**Base path:** `/api/v1/presences/pointages`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/presences/pointages | isAuthenticated() | Legacy check-in | CheckInRequest? / Map<String,Object> | — | missing | compat shim of `PresenceController.checkIn`. |
| POST | /api/v1/presences/pointages/checkout | isAuthenticated() | Legacy check-out | CheckOutRequest? / Map<String,Object> | — | missing | compat shim of `PresenceController.checkOut`. |
| GET | /api/v1/presences/pointages/status | isAuthenticated() | Legacy today status | — / Map<String,Object> | — | missing | compat shim of `PresenceController.getTodayAttendance`. |
| GET | /api/v1/presences/pointages/today | isAuthenticated() | Today's sessions (legacy shape) | — / List<Map<String,Object>> | — | missing | compat shim. |
| GET | /api/v1/presences/pointages/enterprise/status-range | (none — method-level missing) | Enterprise status range | entrepriseId, equipeId?, start, end / Map<LocalDate, TeamStatusResponse> | — | missing | **No @PreAuthorize.** |
| GET | /api/v1/presences/pointages/week | isAuthenticated() | Legacy week summary | — / Map<String,Object> | — | missing | compat shim. |

### Internal controllers (presence-service)

#### InternalPresenceController
**Base path:** `/api/v1/presence/internal`. No `@PreAuthorize` (service-to-service).

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| GET | /api/v1/presence/internal/company/{rhUserId}/today | Internal: company today | — / ApiResponse<TeamStatusResponse> | n/a — internal |
| GET | /api/v1/presence/internal/company/{rhUserId}/stats | Internal: company stats | — / ApiResponse<PresenceStatsDTO> | n/a — internal |

---

## rh-service

### Public controllers

#### AutorisationController
**Base path:** `/api/v1/rh/autorisations`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/autorisations | hasRole('EMPLOYEE') | Create authorization | AutorisationDTO / AutorisationDTO | authorization.create_request | partial | AI tool posts to `/autorisations` (EmployeeCompatibilityController endpoint), not this canonical path. |
| GET | /api/v1/rh/autorisations | EMPLOYEE/MANAGER/RH | List (role-dependent) | page/size / PageResponse<AutorisationDTO> | — | missing | |
| GET | /api/v1/rh/autorisations/me | EMPLOYEE/MANAGER/RH | My history | page/size / PageResponse<AutorisationDTO> | authorization.list_my_requests | ready | |
| GET | /api/v1/rh/autorisations/manager | hasRole('MANAGER') | Manager queue | page/size / PageResponse<AutorisationDTO> | authorization.list_manager_requests | ready | |
| GET | /api/v1/rh/autorisations/my-history | hasRole('EMPLOYEE') | Employee history alias | page/size / PageResponse<AutorisationDTO> | — | missing | compat shim of `/me`. |
| GET | /api/v1/rh/autorisations/manager/history | hasRole('MANAGER') | Manager history alias | page/size / PageResponse<AutorisationDTO> | — | missing | compat shim of `/manager`. |
| GET | /api/v1/rh/autorisations/rh/history | hasRole('RH') | RH history | page/size / PageResponse<AutorisationDTO> | authorization.list_rh_requests | ready | |
| GET | /api/v1/rh/autorisations/kpis/employee | hasRole('EMPLOYEE') | Employee KPIs | — / StatsAutorisationDTO | — | missing | |
| GET | /api/v1/rh/autorisations/kpis/manager | hasRole('MANAGER') | Manager KPIs | — / StatsAutorisationDTO | — | missing | |
| GET | /api/v1/rh/autorisations/kpis/rh | hasRole('RH') | RH KPIs | — / StatsAutorisationDTO | — | missing | |
| PATCH | /api/v1/rh/autorisations/{id}/manager/validate (alt /validate/manager) | hasRole('MANAGER') | Manager approve | — / AutorisationDTO | authorization.manager_decide | ready | |
| PATCH | /api/v1/rh/autorisations/{id}/rh/validate (alt /validate/rh) | hasRole('RH') | RH approve | — / AutorisationDTO | authorization.rh_decide | ready | |
| PATCH | /api/v1/rh/autorisations/{id}/reject (alt /refuser) | MANAGER/RH | Reject | Map body? / commentaire? / AutorisationDTO | authorization.manager_decide / rh_decide (reject branch) | ready | |
| PATCH | /api/v1/rh/autorisations/{id}/cancel | hasRole('EMPLOYEE') | Cancel my request | — / AutorisationDTO | — | missing | |
| GET | /api/v1/rh/autorisations/{id} | EMPLOYEE/MANAGER/RH | Get one | — / AutorisationDTO | authorization.get_status | ready | |

#### CongeController
**Base path:** `/api/v1/rh/conges`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/conges | hasRole('EMPLOYEE') | Create leave | CongeDTO / CongeDTO | leave.create_request | ready | |
| GET | /api/v1/rh/conges | EMPLOYEE/MANAGER/RH | List (role-dependent) | — / List<CongeDTO> | — | missing | |
| GET | /api/v1/rh/conges/me | EMPLOYEE/MANAGER/RH | My leave list | — / List<CongeDTO> | leave.list_my_requests | ready | |
| GET | /api/v1/rh/conges/manager | hasRole('MANAGER') | Manager team leave | — / List<CongeDTO> | leave.list_manager_requests | ready | |
| GET | /api/v1/rh/conges/rh/pending | hasRole('RH') | RH pending leave | — / List<CongeDTO> | leave.list_rh_pending | ready | |
| GET | /api/v1/rh/conges/pending | hasRole('RH') | RH pending (alias) | — / List<CongeDTO> | — | missing | compat alias of `/rh/pending`. |
| GET | /api/v1/rh/conges/{id} | EMPLOYEE/MANAGER/RH | Get leave | — / CongeDTO | leave.get_request_status | ready | |
| GET | /api/v1/rh/conges/utilisateur/{id} | EMPLOYEE/MANAGER/RH | List by user | — / List<CongeDTO> | — | missing | |
| GET | /api/v1/rh/conges/equipe | hasRole('MANAGER') | List by user-id batch | ids[] / List<CongeDTO> | — | missing | |
| PATCH | /api/v1/rh/conges/{id}/valider (alt /validate-manager) | hasRole('MANAGER') | Manager approve | — / CongeDTO | leave.manager_decide (approve) | ready | |
| PATCH | /api/v1/rh/conges/{id}/valider-rh (alt /validate-rh) | hasRole('RH') | RH approve | Map? / CongeDTO | leave.rh_decide (approve) | ready | |
| PATCH | /api/v1/rh/conges/{id}/refuser (alt /refuser-rh, /reject) | MANAGER/RH | Reject | Map?/commentaire? / CongeDTO | leave.manager_decide / rh_decide (reject) | ready | |
| PATCH | /api/v1/rh/conges/{id}/cancel | hasRole('EMPLOYEE') | Cancel my leave | — / CongeDTO | — | missing | |

#### EmployeeCompatibilityController
**Base path:** `/api/v1` (top-level convenience routes)

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/leave-balances | EMPLOYEE/MANAGER/RH | Leave balances (current user or specified) | userId? / List<SoldeCongeDTO> | — | missing | leave.get_balance uses `/rh/solde-conges/me/all` instead. |
| POST | /api/v1/conges | hasRole('EMPLOYEE') | Compat: create leave | CongeDTO / CongeDTO | — | missing | compat shim of `CongeController.create`. |
| POST | /api/v1/autorisations | hasRole('EMPLOYEE') | Compat: create authorization | AutorisationDTO / AutorisationDTO | authorization.create_request | ready | This is the path the AI tool actually targets. |
| POST | /api/v1/teletravail | EMPLOYEE/MANAGER/RH | Compat: create telework | TeletravailCreateDTO / TeletravailResponseDTO | — | missing | compat shim of `TeletravailController.create`. |
| GET | /api/v1/documents | EMPLOYEE/MANAGER/RH | Compat: my documents | — / List<DemandeDocumentResponse> | — | missing | document.list_my_requests uses `/documents/mes-demandes` instead. |

#### ManagerCompatibilityController
**Base path:** `/api/v1`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/requests/manager/pending (alt /manager/requests/pending) | hasRole('MANAGER') | Manager pending queue (mixed) | page/size / ApiResponse<PageResponse<DemandeDTO>> | — | missing | Useful for `manager.pending_approvals` per-type rollup. |
| GET | /api/v1/demandes/manager (alt /demandes/manager/all, /manager/demandes) | hasRole('MANAGER') | Manager all demandes | page/size/statut? / ApiResponse<PageResponse<DemandeDTO>> | — | missing | |
| GET | /api/v1/manager/stats | hasRole('MANAGER') | Manager KPIs | — / ApiResponse<Map<String,Object>> | — | missing | |
| GET | /api/v1/manager/workspace | hasRole('MANAGER') | Manager workspace bundle | — / ApiResponse<Map<String,Object>> | — | missing | |
| PUT | /api/v1/demandes/{id}/statut | hasRole('MANAGER') | Generic per-type approve/reject | WorkflowStatusUpdateRequest / ApiResponse<Object> | — | missing | |

#### RhSoldeController
**Base path:** `/api/v1/rh/soldes`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/soldes | RH/ADMIN | Global soldes (paged) | annee?/query?/Pageable / PageResponse<EmployeeSoldeResponse> | — | missing | |
| POST | /api/v1/rh/soldes/initialiser | RH/ADMIN | Initialise soldes | InitialisationRequest / Void | — | missing | |
| POST | /api/v1/rh/soldes/reinitialiser-annuel | RH/ADMIN | Annual reset | ReinitialisationAnnuelleRequest / Void | — | missing | |
| PATCH | /api/v1/rh/soldes/{utilisateurId}/{typeCongeId} | RH/ADMIN | Adjust solde | SoldeAjustementRequest / Void | — | missing | |
| GET | /api/v1/rh/soldes/{utilisateurId}/audit | RH/ADMIN/MANAGER/EMPLOYEE | Audit log | — / List<SoldeAuditLogDTO> | — | missing | |
| GET | /api/v1/rh/soldes/utilisateur/{utilisateurId} | RH/ADMIN/MANAGER/EMPLOYEE | User detail list | — / List<SoldeDetailDTO> | — | missing | |

#### NotificationController (rh-service)
**Base path:** `/api/v1/rh/notifications`. **No method-level @PreAuthorize on any handler — class is unannotated; relies on filter chain.**

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/notifications/mes-notifications | (none — implicit) | My notifications | — / List<NotificationDTO> | — | missing | **No explicit auth annotation.** |
| GET | /api/v1/rh/notifications/non-lues/count | (none — implicit) | Unread count | — / Long | — | missing | |
| PATCH | /api/v1/rh/notifications/{id}/lire | (none — implicit) | Mark as read | — / Void | — | missing | |
| PATCH | /api/v1/rh/notifications/tout-lire | (none — implicit) | Mark all read | — / Void | — | missing | |
| DELETE | /api/v1/rh/notifications/tout-effacer | (none — implicit) | Clear all | — / Void | — | missing | |
| GET | /api/v1/rh/notifications/rh-context | (none — implicit) | Debug RH context | — / Map<String,Object> | — | missing | |

#### ConfigTeletravailController
**Base path:** `/api/v1/rh/config-teletravail`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/config-teletravail | ADMIN/RH/MANAGER/EMPLOYEE | Get telework config | — / ConfigTeletravail | — | missing | |
| PUT | /api/v1/rh/config-teletravail | ADMIN/RH | Update telework config | ConfigTeletravail / ConfigTeletravail | — | missing | |

#### JourFerieController
**Base path:** `/api/v1/rh/jours-feries`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/jours-feries | EMPLOYEE/MANAGER/RH | All holidays for current enterprise | — / List<JourFerie> | — | missing | |
| GET | /api/v1/rh/jours-feries/range | EMPLOYEE/MANAGER/RH | Holidays in range | start, end / List<JourFerie> | — | missing | |
| GET | /api/v1/rh/jours-feries/{id} | EMPLOYEE/MANAGER/RH | Get holiday | — / JourFerie | — | missing | |
| POST | /api/v1/rh/jours-feries | hasRole('RH') | Create holiday | JourFerie / JourFerie | — | missing | |
| PUT | /api/v1/rh/jours-feries/{id} | hasRole('RH') | Update holiday | JourFerie / JourFerie | — | missing | |
| DELETE | /api/v1/rh/jours-feries/{id} | hasRole('RH') | Delete holiday | — / Void | — | missing | |
| GET | /api/v1/rh/jours-feries/check/{date} | EMPLOYEE/MANAGER/RH | Is given date a holiday | — / Boolean | — | missing | |

#### ReunionController
**Base path:** `/api/v1/rh/reunions`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/reunions | MANAGER/RH | Create meeting | ReunionCreateRequest / ReunionDTO | — | missing | |
| GET | /api/v1/rh/reunions/mes-reunions | isAuthenticated() | My meetings | — / List<ReunionDTO> | reunion.list_mine | ready | |
| GET | /api/v1/rh/reunions/prochaine | isAuthenticated() | Next meeting | — / ReunionDTO | reunion.next | ready | |
| GET | /api/v1/rh/reunions/{uuid} | isAuthenticated() | Detail | — / ReunionDTO | reunion.get_detail | ready | |
| PATCH | /api/v1/rh/reunions/{uuid}/repondre | isAuthenticated() | RSVP | ReunionResponseRequest / Void | — | missing | |
| PATCH | /api/v1/rh/reunions/{uuid}/cloturer | MANAGER/RH | Close meeting | ClotureReunionRequest / Void | — | missing | |
| PATCH | /api/v1/rh/reunions/{uuid}/annuler | MANAGER/RH | Cancel meeting | — / Void | — | missing | |
| GET | /api/v1/rh/reunions/conflits | MANAGER/RH | Check conflicts | date, heureDebut, heureFin, userIds / ConflictResponseDTO | — | missing | |
| GET | /api/v1/rh/reunions/internal/minutes-today | (none — method-level missing) | Internal: total meeting minutes for user/date | userId, date / Long | — | missing | **No @PreAuthorize — should be internal-only.** |

#### RhPlanningController
**Base path:** `/api/v1/rh/planning`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/planning | RH/ADMIN | Planning grid | start, end, teamId?, departmentId? / List<PlanningResponseDTO> | — | missing | |
| POST | /api/v1/rh/planning/bulk-status | RH/ADMIN | Bulk status per user/date | BulkStatusRequest / Map<Long,Map<LocalDate,StatutJournee>> | — | missing | |
| POST | /api/v1/rh/planning/notify | RH/ADMIN | Bulk notification | BulkNotificationRequest / Void | — | missing | |
| GET | /api/v1/rh/planning/is-excused | (none — method-level missing) | Internal: status of user/date | userId, date / StatutJournee | — | missing | **No @PreAuthorize — should be internal-only.** |

#### RhWorkflowCompatibilityController
**Base path:** `/api/v1/rh`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| PUT | /api/v1/rh/demandes/{id}/statut | RH/ADMIN | Generic per-type approve/reject (RH) | WorkflowStatusUpdateRequest / ApiResponse<Object> | — | missing | RH equivalent of ManagerCompatibility `/demandes/{id}/statut`. |

#### TeletravailController
**Base path:** `/api/v1/rh/teletravail` (also `/api/v1/rh/teletravails`)

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/teletravail | EMPLOYEE/MANAGER/RH | Create telework | TeletravailCreateDTO / TeletravailResponseDTO | telework.create_request | ready | |
| GET | /api/v1/rh/teletravail | EMPLOYEE/MANAGER/RH | List (role-dependent) | — / List<TeletravailResponseDTO> | — | missing | |
| GET | /api/v1/rh/teletravail/{id} | EMPLOYEE/MANAGER/RH | Get by id | — / TeletravailResponseDTO | telework.get_status | ready | |
| GET | /api/v1/rh/teletravail/mes-demandes | EMPLOYEE/MANAGER/RH | My telework | — / List<TeletravailResponseDTO> | telework.list_my_requests | ready | |
| GET | /api/v1/rh/teletravail/quota | EMPLOYEE/MANAGER/RH | My quota | — / QuotaTeletravailDTO | — | missing | |
| GET | /api/v1/rh/teletravail/quota/utilisateur/{id} | MANAGER/RH | Quota by user | — / QuotaTeletravailDTO | — | missing | |
| PUT | /api/v1/rh/teletravail/{id}/annuler | EMPLOYEE/MANAGER/RH | Cancel telework | — / TeletravailResponseDTO | — | missing | |
| GET | /api/v1/rh/teletravail/demandes-equipe | hasRole('MANAGER') | Manager team queue | — / List<TeletravailResponseDTO> | telework.list_manager_requests | ready | |
| GET | /api/v1/rh/teletravail/mes-decisions | hasRole('MANAGER') | Manager decisions log | — / List<TeletravailResponseDTO> | — | missing | |
| GET | /api/v1/rh/teletravail/stats-manager | hasRole('MANAGER') | Manager stats | — / StatsManagerDTO | — | missing | |
| PATCH | /api/v1/rh/teletravail/{id}/valider-manager | hasRole('MANAGER') | Manager approve | Map? / TeletravailResponseDTO | telework.manager_decide (approve) | ready | |
| PATCH | /api/v1/rh/teletravail/{id}/rejeter-manager | hasRole('MANAGER') | Manager reject | Map? / TeletravailResponseDTO | telework.manager_decide (reject) | ready | |
| GET | /api/v1/rh/teletravail/en-attente-rh | hasRole('RH') | RH pending | — / List<TeletravailResponseDTO> | telework.list_rh_pending | ready | |
| GET | /api/v1/rh/teletravail/historique-global | hasRole('RH') | RH global history | — / List<TeletravailResponseDTO> | — | missing | |
| GET | /api/v1/rh/teletravail/stats-rh | hasRole('RH') | RH stats | — / StatsRhDTO | — | missing | |
| PATCH | /api/v1/rh/teletravail/{id}/valider-rh | hasRole('RH') | RH approve | Map? / TeletravailResponseDTO | telework.rh_decide (approve) | ready | |
| PATCH | /api/v1/rh/teletravail/{id}/rejeter-rh | hasRole('RH') | RH reject | Map? / TeletravailResponseDTO | telework.rh_decide (reject) | ready | |

#### TypeAutorisationController
**Base path:** `/api/v1/rh/parametres/types-autorisations`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/parametres/types-autorisations | (none — method-level missing) | Create type | TypeAutorisationDTO / TypeAutorisationDTO | — | missing | **No @PreAuthorize on create.** |
| GET | /api/v1/rh/parametres/types-autorisations/{id} | ADMIN/RH/MANAGER/EMPLOYEE | Get type | — / TypeAutorisationDTO | — | missing | |
| GET | /api/v1/rh/parametres/types-autorisations | ADMIN/RH/MANAGER/EMPLOYEE | List types | — / List<TypeAutorisationDTO> | authorization.create_request (label lookup) | ready | |
| PUT | /api/v1/rh/parametres/types-autorisations/{id} | (none — method-level missing) | Update type | TypeAutorisationDTO / TypeAutorisationDTO | — | missing | **No @PreAuthorize.** |
| DELETE | /api/v1/rh/parametres/types-autorisations/{id} | (none — method-level missing) | Delete type | — / Void | — | missing | **No @PreAuthorize.** |

#### TypeDocumentController
**Base path:** `/api/v1/rh/parametres/types-documents`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/parametres/types-documents | (none — method-level missing) | Create type | TypeDocumentDTO / TypeDocumentDTO | — | missing | **No @PreAuthorize.** |
| GET | /api/v1/rh/parametres/types-documents/{id} | ADMIN/RH/MANAGER/EMPLOYEE | Get type | — / TypeDocumentDTO | — | missing | |
| GET | /api/v1/rh/parametres/types-documents | ADMIN/RH/MANAGER/EMPLOYEE | List types | — / List<TypeDocumentDTO> | — | missing | |
| PUT | /api/v1/rh/parametres/types-documents/{id} | (none — method-level missing) | Update type | TypeDocumentDTO / TypeDocumentDTO | — | missing | **No @PreAuthorize.** |
| DELETE | /api/v1/rh/parametres/types-documents/{id} | (none — method-level missing) | Delete type | — / Void | — | missing | **No @PreAuthorize.** |

#### TypeTeletravailController
**Base path:** `/api/v1/rh/type-teletravail`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/type-teletravail | ADMIN/RH/MANAGER/EMPLOYEE | List telework types | — / List<TypeTeletravail> | — | missing | |
| POST | /api/v1/rh/type-teletravail | ADMIN/RH | Create | TypeTeletravail / TypeTeletravail | — | missing | |
| PUT | /api/v1/rh/type-teletravail/{id} | ADMIN/RH | Update | TypeTeletravail / TypeTeletravail | — | missing | |
| DELETE | /api/v1/rh/type-teletravail/{id} | ADMIN/RH | Delete | — / Void | — | missing | |

#### TypeCongeController
**Base path:** `/api/v1/rh/type-conges`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/rh/type-conges | ADMIN/RH/MANAGER | Create type | TypeCongeDTO / TypeCongeDTO | — | missing | |
| GET | /api/v1/rh/type-conges | ADMIN/RH/MANAGER/EMPLOYEE | List types | page?, size? / List or ApiResponse<PageResponse<TypeCongeDTO>> | leave.create_request (label lookup) | ready | |
| GET | /api/v1/rh/type-conges/{id} | ADMIN/RH/MANAGER/EMPLOYEE | Get type | — / TypeCongeDTO | — | missing | |
| PUT | /api/v1/rh/type-conges/{id} | ADMIN/RH/MANAGER | Update | TypeCongeDTO / TypeCongeDTO | — | missing | |
| DELETE | /api/v1/rh/type-conges/{id} | ADMIN/RH/MANAGER | Delete | — / Void | — | missing | |

#### RhDashboardCompatibilityController
**Base path:** `/api/v1/rh`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/dashboard | RH/ADMIN | RH dashboard bundle | — / ApiResponse<RhDashboardDTO> | — | missing | insights.rh_daily aggregates lower-level endpoints; could be wired here. |
| GET | /api/v1/rh/stats | RH/ADMIN | RH stats overview | — / ApiResponse<Map<String,Object>> | rh.get_stats | ready | |
| GET | /api/v1/rh/stats/evolution-mensuelle | RH/ADMIN | Monthly evolution | — / ApiResponse<Map<Integer,Long>> | — | missing | |
| GET | /api/v1/rh/stats/demandes-par-type | RH/ADMIN | Requests by type | — / ApiResponse<Map<String,Long>> | — | missing | |

#### DocumentController
**Base path:** `/api/v1/documents`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/documents | EMPLOYEE/MANAGER/RH | Create document request | CreateDocumentRequest / DemandeDocumentResponse | document.create_request | ready | |
| GET | /api/v1/documents/mes-demandes | hasRole('EMPLOYEE') | My document requests | — / List<DemandeDocumentResponse> | document.list_my_requests | ready | |
| PUT | /api/v1/documents/{id}/annuler | hasRole('EMPLOYEE') | Cancel my request | — / DemandeDocumentResponse | — | missing | |
| GET | /api/v1/documents/{id}/telecharger | hasRole('EMPLOYEE') | Download my doc | — / Resource (PDF) | document.open (employee branch) | ready | |
| PUT | /api/v1/documents/{id}/statut | hasRole('RH') | Update status (RH) | UpdateStatutRequest / DemandeDocumentResponse | — | missing | |
| GET | /api/v1/documents/rh/demandes | hasRole('RH') | RH list (paged) | page?, size? / List or PageResponse | document.list_my_requests (RH branch) | ready | |
| GET | /api/v1/documents/rh/stats | hasRole('RH') | RH stats | — / StatsDocumentsDTO | document.rh_workload | ready | |
| PUT | /api/v1/documents/{id}/passer-en-cours | hasRole('RH') | Mark in progress | — / DemandeDocumentResponse | — | missing | |
| PUT | /api/v1/documents/{id}/valider | hasRole('RH') | Validate request | ValiderDocumentRequest / DemandeDocumentResponse | — | missing | |
| POST | /api/v1/documents/{id}/upload | hasRole('RH') | RH upload signed PDF | multipart "file" / DemandeDocumentResponse | — | missing | |
| PUT | /api/v1/documents/{id}/refuser | hasRole('RH') | Refuse request | Map{commentaireRH} / DemandeDocumentResponse | document.rh_reject | ready | |
| GET | /api/v1/documents/{id}/file | hasRole('RH') | View RH attachment | — / Resource (PDF inline) | document.open (RH branch) | ready | |
| POST | /api/v1/documents/rh/generate-ai | hasRole('RH') | AI-generate document body | AIGenerationRequest / AIGenerationResult | document.rh_generate | ready | |

#### DemandeController
**Base path:** `/api/v1/rh/demandes`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/demandes | RH/MANAGER/ADMIN/SUPER_ADMIN | List for enterprise | page/size/filters / ApiResponse<PageResponse<DemandeDTO>> | — | missing | Candidate for a `manager.pending_approvals` data source. |
| GET | /api/v1/rh/demandes/admin | ADMIN/SUPER_ADMIN | List global | page/size/filters / ApiResponse<PageResponse<DemandeDTO>> | — | missing | |
| GET | /api/v1/rh/demandes/{id} | RH/MANAGER/ADMIN/SUPER_ADMIN | Get one | — / DemandeDTO | — | missing | |
| GET | /api/v1/rh/demandes/utilisateur/{id} | RH/MANAGER | By user | — / List<DemandeDTO> | — | missing | |
| GET | /api/v1/rh/demandes/manager/{id} | RH/MANAGER | By manager | — / List<DemandeDTO> | — | missing | |
| GET | /api/v1/rh/demandes/manager/{id}/all | RH/MANAGER | By manager (paged + filters) | filters / ApiResponse<PageResponse<DemandeDTO>> | — | missing | |

#### SoldeCongeController
**Base path:** `/api/v1/rh/solde-conges`

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/rh/solde-conges/me/all | EMPLOYEE/MANAGER/RH | All my soldes | annee? / List<SoldeCongeDTO> | leave.get_balance | ready | |
| GET | /api/v1/rh/solde-conges/me | EMPLOYEE/MANAGER/RH | My solde for one type | typeCongeId, annee? / SoldeCongeDTO | — | missing | |
| GET | /api/v1/rh/solde-conges/users/{utilisateurId} | RH/MANAGER | User soldes | annee? / List<SoldeCongeDTO> | — | missing | |
| GET | /api/v1/rh/solde-conges | EMPLOYEE/RH | Solde by user+type | utilisateurId, typeCongeId / SoldeCongeDTO | — | missing | |
| GET | /api/v1/rh/solde-conges/utilisateur/{utilisateurId} | EMPLOYEE/RH | User soldes (alt) | — / List<SoldeCongeDTO> | — | missing | compat shim of `/users/{utilisateurId}`. |
| POST | /api/v1/rh/solde-conges | hasRole('RH') | Set solde | SoldeCongeDTO / SoldeCongeDTO | — | missing | |
| PUT | /api/v1/rh/solde-conges/{id} | hasRole('RH') | Update by id | SoldeCongeDTO / SoldeCongeDTO | — | missing | |
| PATCH | /api/v1/rh/solde-conges/{id} | hasRole('RH') | Patch by id | SoldeCongeDTO / SoldeCongeDTO | — | missing | |
| GET | /api/v1/rh/solde-conges/total | EMPLOYEE/RH | Total remaining days | utilisateurId / Double | — | missing | |
| POST | /api/v1/rh/solde-conges/bulk-initialization | hasRole('RH') | Bulk init | List<Long>, overwrite=false / Void | — | missing | |

### Internal controllers (rh-service)

#### InternalIntegrationController
**Base path:** `/api/demandes`. **No @PreAuthorize — flag for review.**

| Method | Path | Purpose | Request / Response DTO | AI readiness |
|---|---|---|---|---|
| GET | /api/demandes/user/{userId}/date/{date} | Has approved leave for user/date | — / Boolean | n/a — internal **(open)** |
| GET | /api/demandes/teletravail/user/{userId}/date/{date} | Has approved telework for user/date | — / Boolean | n/a — internal **(open)** |

---

## communication-service

### Public controllers

#### ChannelController
**Base path:** `/api/v1/communication`. No `@PreAuthorize`; relies on filter chain + `SecurityUtils.currentUser()`.

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/communication/channels | (none — implicit) | List my channels | — / ApiEnvelope<List<ChannelResponse>> | communication.list_channels | ready | |
| GET | /api/v1/communication/channels/{channelId} | (none — implicit) | Get channel | — / ApiEnvelope<ChannelResponse> | — | missing | |
| POST | /api/v1/communication/channels | (none — implicit) | Create channel | CreateChannelRequest / ApiEnvelope<ChannelResponse> | — | missing | |
| POST | /api/v1/communication/channels/workflow | (none — implicit) | Create workflow channel | CreateWorkflowChannelRequest / ApiEnvelope<ChannelResponse> | — | missing | |
| GET | /api/v1/communication/channels/workflow/{demandeId} | (none — implicit) | Get workflow channel by demande | — / ApiEnvelope<ChannelResponse> | — | missing | |
| POST | /api/v1/communication/direct | (none — implicit) | Open DM | OpenDirectRequest / ApiEnvelope<ChannelResponse> | — | missing | |
| POST | /api/v1/communication/channels/{channelId}/read | (none — implicit) | Mark channel read | MarkChannelReadRequest? / ApiEnvelope<ReadMarkerResponse> | — | missing | |
| GET | /api/v1/communication/unread-summary | (none — implicit) | Unread summary | — / ApiEnvelope<UnreadSummaryResponse> | — | missing | |
| GET | /api/v1/communication/preferences/notifications | (none — implicit) | Get notification prefs | — / ApiEnvelope<NotificationPreferencesResponse> | — | missing | |
| PUT | /api/v1/communication/preferences/notifications | (none — implicit) | Update notification prefs | UpdateNotificationPreferencesRequest? / ApiEnvelope<NotificationPreferencesResponse> | — | missing | |
| PUT | /api/v1/communication/channels/{channelId}/notification-level | (none — implicit) | Set per-channel notif level | UpdateChannelNotificationRequest? / ApiEnvelope<Void> | — | missing | |

#### RealtimeEventController
**Base path:** `/api/v1/communication`. No `@PreAuthorize`.

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/communication/events/replay (alt /events/missed) | (none — implicit) | Replay missed events | afterEventId?/after?/limit? / ApiEnvelope<EventReplayResponse> | — | missing | |

#### CommunicationAdminController
**Base path:** `/api/v1/communication/admin`. No `@PreAuthorize` — admin gate must be enforced at filter chain. **Flag for review.**

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/communication/admin/sync | (none — implicit) | Sync current enterprise | — / ApiEnvelope<ProvisioningSyncResponse> | — | missing | **No method-level auth.** |
| POST | /api/v1/communication/admin/sync/enterprise/{entrepriseId} | (none — implicit) | Sync a specific enterprise | — / ApiEnvelope<ProvisioningSyncResponse> | — | missing | **No method-level auth.** |
| POST | /api/v1/communication/admin/bootstrap | (none — implicit) | Bootstrap current enterprise | — / ApiEnvelope<CommunicationBootstrapResponse> | — | missing | **No method-level auth.** |
| GET | /api/v1/communication/admin/outbox/status | (none — implicit) | Outbox dispatcher status | — / ApiEnvelope<AdminOutboxStatusResponse> | — | missing | **No method-level auth.** |

#### AttachmentController
**Base path:** `/api/v1/communication/attachments`. No `@PreAuthorize`.

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| POST | /api/v1/communication/attachments | (none — implicit) | Upload up to 5 files | multipart "files" / ApiEnvelope<List<AttachmentResponse>> | — | missing | |
| GET | /api/v1/communication/attachments/{id}/download | (none — implicit) | Download attachment | — / Resource | — | missing | |

#### MessageController
**Base path:** `/api/v1/communication`. No `@PreAuthorize`.

| Method | Path | @PreAuthorize | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/communication/channels/{channelId}/messages | (none — implicit) | Get messages (cursor) | limit, before? / ApiEnvelope<CursorMessagePageResponse> | communication.get_channel_messages, communication.summarize_channel | ready | |
| POST | /api/v1/communication/channels/{channelId}/messages | (none — implicit) | Send message | SendMessageRequest / ApiEnvelope<MessageResponse> | communication.send_message | ready | |
| PUT | /api/v1/communication/messages/{messageId} | (none — implicit) | Edit message | UpdateMessageRequest / ApiEnvelope<MessageResponse> | — | missing | |
| DELETE | /api/v1/communication/messages/{messageId} | (none — implicit) | Delete message | — / ApiEnvelope<MessageResponse> | — | missing | |
| PUT | /api/v1/communication/messages/{messageId}/reactions/{emoji} | (none — implicit) | Add reaction | — / ApiEnvelope<MessageResponse> | — | missing | |
| DELETE | /api/v1/communication/messages/{messageId}/reactions/{emoji} | (none — implicit) | Remove reaction | — / ApiEnvelope<MessageResponse> | — | missing | |
| POST | /api/v1/communication/messages/{messageId}/read | (none — implicit) | Mark message read | — / ApiEnvelope<ReadMarkerResponse> | — | missing | |
| PUT | /api/v1/communication/messages/{messageId}/pin | (none — implicit) | Pin message | — / ApiEnvelope<MessageResponse> | — | missing | |
| PUT | /api/v1/communication/messages/{messageId}/unpin | (none — implicit) | Unpin message | — / ApiEnvelope<MessageResponse> | — | missing | |
| GET | /api/v1/communication/messages/{messageId}/replies | (none — implicit) | Thread replies | limit / ApiEnvelope<CursorMessagePageResponse> | — | missing | |

#### CommunicationWebSocketController (WebSocket, not REST)
**Base path:** STOMP destinations (`@Controller`, `@MessageMapping`). Listed for completeness; not callable by the ai-service HTTP `backend_client`.

| Destination | Purpose | Payload |
|---|---|---|
| /app/communication/channels/{channelId}/messages | Send message via WebSocket | SendMessageRequest |
| /app/communication/channels/{channelId}/typing | Publish typing indicator | TypingEventRequest |

---

## Feature rollup

### Pointage / Presence
- **Real-data prompts:** "Suis-je pointe ?" → `GET /presence/me/today` (`get_pointage_status`, ready). "Pointer entree" → `POST /presence/me/check-in` (`check_in`, ready). "Pointer sortie" → `POST /presence/me/check-out` (`check_out`, ready). "Mes heures cette semaine" → `GET /presence/me/stats` (`get_week_hours`, ready). "Historique" → `GET /presence/me/history` (`get_presence_history`, ready). Team/RH/Admin overview → `get_team_presence` (ready for MANAGER/RH/ADMIN branches).
- **Need capability_unavailable:** active-session probe, team history paging, company stats, admin global analytics filtering by team/department, week-status grid, status-range, pointage compat endpoints.
- **Missing tools:** `presence.active_session`, `presence.team_history`, `presence.company_stats`, `presence.status_range`.

### Autorisations
- **Real-data prompts:** "Demander une autorisation" → `POST /autorisations` (`authorization.create_request`, ready). "Mes autorisations" → `authorization.list_my_requests`. "Approbations en attente (manager)" → `authorization.list_manager_requests`. "RH historique" → `authorization.list_rh_requests`. Validate/Reject by manager or RH → `authorization.manager_decide` / `rh_decide`. Get by id → `authorization.get_status`.
- **Need capability_unavailable:** employee/manager/RH KPI tiles, cancel my request, type lookup beyond create-request flow.
- **Missing tools:** `authorization.cancel`, `authorization.kpis`.

### Congés
- **Real-data prompts:** "Mon solde" → `leave.get_balance` (ready). "Mes congés" → `leave.list_my_requests`. "Validations équipe" → `leave.list_manager_requests`. "Congés à valider RH" → `leave.list_rh_pending`. Create → `leave.create_request`. Approve/reject → `leave.manager_decide` / `rh_decide`. Get by id → `leave.get_request_status`.
- **Need capability_unavailable:** cancel my leave, solde-by-type, total remaining, audit, solde adjustments (RH), bulk init (RH), planning compat.
- **Missing tools:** `leave.cancel`, `leave.adjust_balance`, `leave.audit_log`, `leave.types` (currently only used as internal lookup inside create_request).

### Documents
- **Real-data prompts:** "Demander une attestation" → `document.create_request` (ready). "Mes demandes" → `document.list_my_requests`. "File d'attente RH" → `document.list_my_requests` RH branch. "Charge de travail RH" → `document.rh_workload`. RH refuse → `document.rh_reject`. AI-generate body → `document.rh_generate`. Open / download → `document.open`.
- **Need capability_unavailable:** cancel my request, RH mark in-progress, RH validate, RH upload signed PDF, generic status update.
- **Missing tools:** `document.cancel`, `document.rh_mark_in_progress`, `document.rh_validate`, `document.rh_upload`.

### Télétravail
- **Real-data prompts:** Create / list mine / list manager team / list RH pending / get one / manager decide / RH decide — all ready (`telework.*`).
- **Need capability_unavailable:** quota (self + by user), cancel, manager decisions log, manager/RH stats, RH global history.
- **Missing tools:** `telework.get_quota`, `telework.cancel`, `telework.manager_stats`, `telework.rh_stats`, `telework.rh_history`.

### Planning / Horaires
- No tools wired. All planning grid, bulk-status, bulk-notify, and individual horaire CRUD endpoints currently return `capability_unavailable` from the AI layer.
- **Missing tools:** `planning.get_grid`, `planning.bulk_status`, `planning.notify`, `schedule.list`, `schedule.team_schedules`, `schedule.resolve_for_me`.

### Réunions
- **Real-data prompts:** "Mes réunions" → `reunion.list_mine` (ready). "Prochaine réunion" → `reunion.next` (ready, 404 maps to safe empty). "Détail" → `reunion.get_detail` (ready).
- **Need capability_unavailable:** create, RSVP, close, cancel, conflict-check.
- **Missing tools:** `reunion.create`, `reunion.respond`, `reunion.close`, `reunion.cancel`, `reunion.check_conflicts`.

### Team presence
- See "Pointage / Presence" — `get_team_presence` covers MANAGER (`/presence/team/today`), RH (`/presence/company/today`), ADMIN (`/presence/global/analytics`). Team **history** and team **schedules** are missing.

### Pending approvals
- The AI surface area for "approbations en attente (manager)" today routes through per-type tools (`leave.list_manager_requests`, `authorization.list_manager_requests`, `telework.list_manager_requests`). A unified rollup endpoint exists at `GET /requests/manager/pending` (ManagerCompatibilityController) but has **no AI tool**.
- **Need capability_unavailable** until added: `manager.pending_approvals` (composite rollup), `manager.workspace` (`GET /manager/workspace`), `manager.stats` (`GET /manager/stats`), `manager.generic_decide` (`PUT /demandes/{id}/statut`).
- For the RH side, `RhWorkflowCompatibilityController.PUT /rh/demandes/{id}/statut`, `DemandeController` enterprise + admin lists, and `RhDashboardCompatibilityController.GET /rh/dashboard` are all missing AI wrappers.

---

## Surprises / risk surface

1. **organisation-service `UserIntegrationController` at `/api/users/**`** has zero auth annotations on three GETs (`{id}`, `{id}/manager`, `{id}/roles`). These leak per-user data unless the gateway blocks the path.
2. **organisation-service `UtilisateurController`** has multiple **method-level missing** `@PreAuthorize` on routes that ought to be internal-only: `/auth/by-email`, all `/2fa/*` Feign endpoints, and the `/entreprise/{entrepriseId}*` triplet.
3. **organisation-service `InternalNotificationController`** at `/api/v1/notifications/internal/**` has no `X-Internal-Service-Key` validator (unlike `InternalCommunicationNotificationController`), so anything that can reach this path can send notifications to any user/role/manager/RH.
4. **organisation-service `UserController.me/*`** family lacks `@PreAuthorize`. Filter chain may still authenticate via JWT, but the missing annotations are inconsistent with the rest of the controller.
5. **rh-service `InternalIntegrationController`** at `/api/demandes/**` is unauthenticated — used by presence-service over Feign. Should be locked to internal service key.
6. **rh-service `ReunionController.GET /internal/minutes-today`** and **`RhPlanningController.GET /is-excused`** sit on a public base path with no `@PreAuthorize`.
7. **rh-service `NotificationController` (`/api/v1/rh/notifications`)** has zero method-level auth. Relies entirely on filter chain to authenticate.
8. **rh-service `TypeAutorisationController` / `TypeDocumentController`** allow create/update/delete with no role check on the write paths.
9. **communication-service** entire controller layer (`ChannelController`, `MessageController`, `AttachmentController`, `CommunicationAdminController`, `RealtimeEventController`) has no `@PreAuthorize`. Admin endpoints in particular (`/communication/admin/**`) should require an admin role.
10. **presence-service `PointageCompatibilityController.GET /enterprise/status-range`** lacks `@PreAuthorize` despite returning enterprise-wide attendance data.
11. **Duplicate paths:** `/api/v1/organisations/by-code/{code}` and `/api/v1/organisations/entreprises/by-code/{code}` resolve the same call; AI tool layer is not affected, but tenant-validation deduplication may be needed.
12. **Compat shims** (`Employee/Manager/RhWorkflow/PointageCompatibility/RhDashboardCompatibility` controllers) duplicate canonical paths with subtle response-shape differences (e.g. `Map<String,Object>` payloads). When wiring new AI tools, prefer the canonical paths and treat compat shims as front-end-only.
13. **Endpoint mismatch:** `authorization.create_request` posts to `/autorisations` (the EmployeeCompatibility path) rather than the canonical `/rh/autorisations`. Both work; documented here to avoid confusion.
14. **AuthController** does not annotate its 2FA setup/confirm/disable handlers with `@PreAuthorize`, relying on the injected `Authentication` arg and filter chain — inconsistent with other auth flows.
