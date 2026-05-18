# FRONTEND_CONTEXT_MAP

Date: 2026-05-18

Source: filesystem inspection of Angular routes and chatbot services. Active route source: `weentime-frontend/angular-weentime/src/app/features/shell/shell.routes.ts`, `app.routes.ts`, communication/reunion/vocal route files, and chatbot service/component files.

Chat widget: `src/app/shared/chat-widget/chat-widget.component.*` is mounted in `features/shell/shell.component.ts` as `<app-chat-widget />` for authenticated app pages.

Metadata: `AiCopilotService` and `VoiceAssistantService` send `chatbotPublicContext`, role, user/company/enterprise ids, `current_page`, `currentPage`, session/conversation ids, channel, and language. The AI service normalizes both `current_page` and `currentPage`.

## Chatbot Context Sources

| File | Purpose |
|---|---|
| `src/app/core/services/ai-copilot.service.ts` | Text chat/confirm/reset request metadata and current page capture. |
| `src/app/shared/chat-widget/voice-assistant.service.ts` | Voice request metadata, current page capture, session continuity. |
| `src/app/shared/chat-widget/chat.service.ts` | Chat/TTS compatibility service and AI HTTP context marker. |
| `src/app/core/http/request-context.tokens.ts` | Marks AI chatbot requests for auth interceptor/gateway handling. |
| `src/app/shared/chat-widget/chat-widget.component.ts` | Widget state, role prompts, rendering, session cache. |
| `src/app/shared/chat-widget/safe-text.util.ts` | Safe rendering of unknown response values. |

## Global Routes

| Route | Page context | Component/page | Actions |
|---|---|---|---|
| `/` | PUBLIC_LANDING | Landing page | marketing, login/register links |
| `/pricing` | PUBLIC_PRICING | Pricing page | marketing pricing |
| `/login` | AUTH_LOGIN | Login page | authenticate |
| `/register` | AUTH_REGISTER | Register page | account registration |
| `/auth/verify-2fa` | AUTH_2FA | 2FA page | verify MFA |
| `/app/notifications` | NOTIFICATIONS | Notification page | view notifications |
| `/app/vocal` | VOCAL_DASHBOARD | Vocal dashboard | voice interface |
| `/app/messages` | MESSAGES | Communication shell/channel pages | list channels, read messages, send messages |
| `/app/reunions` | MEETINGS | Reunion dashboard | list meetings |
| `/app/reunions/create` | MEETING_CREATE | Reunion create | create meeting if backend/UI supports |
| `/app/reunions/:uuid` | MEETING_DETAIL | Reunion detail | view/respond/close/cancel meeting if authorized |

## Employee Routes

| Route | Page context | Actions |
|---|---|---|
| `/app/employee/dashboard` | EMPLOYEE_DASHBOARD | daily summary, personal alerts, quick access |
| `/app/employee/conges` | EMPLOYEE_LEAVE | leave balance, list/create leave requests |
| `/app/employee/documents` | EMPLOYEE_DOCUMENTS | list/request/download documents |
| `/app/employee/teletravail` | EMPLOYEE_TELEWORK | list/create telework requests, status |
| `/app/employee/absences` | EMPLOYEE_ABSENCES | absence requests/status |
| `/app/employee/pointage` | EMPLOYEE_ATTENDANCE | check-in, check-out, status, history |
| `/app/employee/autorisations` | EMPLOYEE_AUTHORIZATIONS | list/create authorization requests |
| `/app/employee/autorisations/nouvelle` | EMPLOYEE_AUTHORIZATION_CREATE | create authorization |
| `/app/employee/profil` | EMPLOYEE_PROFILE | view/update profile |
| `/app/employee/horaires` | EMPLOYEE_SCHEDULES | personal schedules/hours |

## Manager Routes

| Route | Page context | Actions |
|---|---|---|
| `/app/manager/dashboard` | MANAGER_DASHBOARD | manager digest, pending work, team overview |
| `/app/manager/pointage` | MANAGER_SELF_ATTENDANCE | personal pointage via employee pointage component |
| `/app/manager/equipe` | MANAGER_TEAM | team list/workload |
| `/app/manager/approbations` | MANAGER_APPROVALS | pending approvals, approve/reject leave/telework/authorization with confirmation |
| `/app/manager/teletravail` | MANAGER_TELEWORK | team telework approvals/status |
| `/app/manager/absences` | MANAGER_ABSENCES | team absences |
| `/app/manager/autorisations` | MANAGER_AUTHORIZATIONS | authorization approvals |
| `/app/manager/profil` | MANAGER_PROFILE | profile |
| `/app/manager/horaires` | MANAGER_SCHEDULES | team/personal schedules |
| `/app/manager/presence` | MANAGER_PRESENCE | team presence/attendance |

## RH Routes

| Route | Page context | Actions |
|---|---|---|
| `/app/rh/dashboard` | RH_DASHBOARD | RH stats, backlog, pending validations, operational digest |
| `/app/rh/analytics` | RH_ANALYTICS | RH analytics/stats when backend exposes them |
| `/app/rh/requests` | RH_REQUESTS | RH request queue |
| `/app/rh/leave-balances` | RH_LEAVE_BALANCES | leave balance management |
| `/app/rh/structure` | RH_STRUCTURE | structure shell; redirects to departments |
| `/app/rh/structure/departements` | RH_STRUCTURE_DEPARTMENTS | create/list/update/delete departments |
| `/app/rh/structure/departments` | RH_STRUCTURE_DEPARTMENTS_ALIAS | AI-supported alias for user prompts/metadata; Angular route uses `departements` |
| `/app/rh/structure/equipes` | RH_STRUCTURE_TEAMS | create/list teams, assign manager, assign employee to team if tool exists |
| `/app/rh/structure/employes` | RH_STRUCTURE_EMPLOYEES | list/update/activate/deactivate employees if backend supports |
| `/app/rh/structure/managers` | RH_STRUCTURE_MANAGERS | list/create/assign managers if backend supports |
| `/app/rh/employes` | RH_EMPLOYEES_REDIRECT | redirects to `/app/rh/structure/employes` |
| `/app/rh/conges` | RH_LEAVE | list/pending/approve/reject leave requests |
| `/app/rh/teletravail` | RH_TELEWORK | list/pending/approve/reject telework |
| `/app/rh/documents` | RH_DOCUMENTS | document workload, urgent documents, generate/upload/refuse documents |
| `/app/rh/absences` | RH_ABSENCES | absence management |
| `/app/rh/autorisations` | RH_AUTHORIZATIONS | list/pending/approve/reject authorizations |
| `/app/rh/parametres` | RH_SETTINGS | leave types, balances, telework config, document templates if backend supports |
| `/app/rh/horaires` | RH_SCHEDULES | list schedules, create/assign schedules where tools exist |
| `/app/rh/planning` | RH_PLANNING | RH planning view if backend/tool connected |
| `/app/rh/horaires/nouveau` | RH_SCHEDULE_CREATE | schedule creation form |
| `/app/rh/horaires/:id/modifier` | RH_SCHEDULE_EDIT | schedule edit form |
| `/app/rh/horaires/affecter` | RH_SCHEDULE_ASSIGN | schedule assignment form |
| `/app/rh/pointage` | RH_ATTENDANCE | global/company presence, missing check-ins, attendance corrections if backend/tool exists |
| `/app/rh/presence` | RH_PRESENCE | presence view |
| `/app/rh/profil` | RH_PROFILE | profile |

RH hybrid AI page priority implemented for: departments/departements, equipes, employes, managers, conges, horaires, pointage/presence, autorisations, teletravail, documents, parametres, profil, and messages.

## Admin Routes

| Route | Page context | Actions |
|---|---|---|
| `/app/admin/dashboard` | ADMIN_DASHBOARD | system/platform overview |
| `/app/admin/users` | ADMIN_USERS | list/create/update/delete users, role changes if tools exist |
| `/app/admin/entreprises` | ADMIN_ENTERPRISES | list/create/update enterprises if tools exist |
| `/app/admin/roles` | ADMIN_ROLES | role/permission management if backend supports |
| `/app/admin/parametres` | ADMIN_SETTINGS | admin settings |
| `/app/admin/analytics` | ADMIN_ANALYTICS | platform analytics |
| `/app/admin/departements` | ADMIN_DEPARTMENTS | department administration |
| `/app/admin/equipes` | ADMIN_TEAMS | team administration |
| `/app/admin/settings` | ADMIN_SETTINGS_ALT | settings alias |
| `/app/admin/pointage` | ADMIN_ATTENDANCE | pointage view via employee pointage component |
| `/app/admin/presence` | ADMIN_PRESENCE | presence view via pointage component |
| `/app/admin/rh-owners` | ADMIN_RH_OWNERS | RH owner assignment |
| `/app/admin/profil` | ADMIN_PROFILE | profile |

## Playwright Observation

- Dev server was not initially running; `http://127.0.0.1:4200` returned connection refused.
- Started Angular dev server locally for validation.
- `/app/rh/structure/departments` redirected to landing `/` because the route is guarded and the Angular route is actually `/app/rh/structure/departements`.
- `/app/rh/horaires` and `/app/rh/pointage` redirected to `/login` through the auth guard.
- Console had no warnings/errors during these navigations.
- Full RH chat-widget page interaction requires authenticated seeded RH session plus backend/gateway/AI stack running.
