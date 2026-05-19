# RH Backend Tool Gap Report

Date: 2026-05-19
Task: RH-HYBRID-AGENT-02

## Scope

Inspected Spring backend controllers and AI ToolRegistry-backed tools for RH organisation, presence, RH requests, documents, schedules, communication, and analytics. Spring Boot remains the source of truth. AI tools call backend APIs only through ToolRegistry/BackendClient and do not use fake data or raw SQL.

## Classification Legend

- IMPLEMENTED_TOOL: ToolRegistry tool exists and is connected to a verified backend endpoint or verified compatibility path.
- VERIFIED_ENDPOINT_NO_TOOL: Backend endpoint exists but no dedicated AI tool is currently exposed.
- BACKEND_MISSING: No verified backend endpoint was found for the capability.
- NEEDS_PAYLOAD_CONFIRMATION: Endpoint exists, but request payload or business contract needs runtime/backend confirmation before exposing more automation.

## Organisation

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| departments list | IMPLEMENTED_TOOL | organisation.list_departments | GET /structure/departments, fallback GET /organisations/departements |
| departments create | IMPLEMENTED_TOOL | organisation.create_department, rh.structure.department.create | POST /organisations/departements |
| departments update | IMPLEMENTED_TOOL | organisation.update_department, rh.structure.department.update | GET /organisations/departements/{id}, PUT /organisations/departements/{id} |
| departments delete | IMPLEMENTED_TOOL | organisation.delete_department, rh.structure.department.delete | DELETE /organisations/departements/{id} |
| teams list | IMPLEMENTED_TOOL | organisation.list_teams | GET /structure/teams, fallback GET /organisations/equipes |
| teams create | IMPLEMENTED_TOOL | organisation.create_team, rh.structure.team.create | POST /organisations/equipes |
| teams update | IMPLEMENTED_TOOL | organisation.update_team, rh.structure.team.update | GET /organisations/equipes/{id}, PUT /organisations/equipes/{id} |
| teams delete | IMPLEMENTED_TOOL | organisation.delete_team, rh.structure.team.delete | DELETE /organisations/equipes/{id} |
| team members | IMPLEMENTED_TOOL | organisation.team_members, rh.structure.team.members | GET /structure/teams/{id}/members |
| employee assign to team | IMPLEMENTED_TOOL | organisation.assign_employee_team, rh.structure.employee.assign_team | GET /organisations/users/{id}, GET /organisations/equipes/{id}, PUT /organisations/users/{id} with equipeId |
| manager assign to team | IMPLEMENTED_TOOL | organisation.assign_manager_team, rh.structure.manager.assign_team | GET /organisations/equipes/{id}, GET /organisations/users/{id}, PUT /organisations/equipes/{id} with managerId |
| employee list/search/profile | IMPLEMENTED_TOOL | organisation.list_employees, organisation.search_employee | GET /structure/employees, GET /structure/managers, fallback GET /organisations/users |
| employee create/update | IMPLEMENTED_TOOL / VERIFIED_ENDPOINT_NO_TOOL | organisation.create_employee, rh.structure.employee.create / update endpoint exists but no dedicated update tool | POST /organisations/users; PUT/PATCH /organisations/users/{id} exists |
| employee activate/deactivate | IMPLEMENTED_TOOL | organisation.activate_employee, organisation.deactivate_employee, rh.structure.employee.activate, rh.structure.employee.deactivate | GET /organisations/users/{id}, PUT /organisations/users/{id} with active flag |
| manager create/update/assign | IMPLEMENTED_TOOL / VERIFIED_ENDPOINT_NO_TOOL | organisation.create_manager, organisation.assign_manager_team / no dedicated manager update tool | POST /organisations/users role MANAGER; team manager assignment via PUT /organisations/equipes/{id} |

## Presence / Attendance

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| self status | IMPLEMENTED_TOOL | attendance.status, attendance.self.status | GET /presence/me/today |
| check-in | IMPLEMENTED_TOOL | attendance.check_in, attendance.self.check_in | POST /presence/check-in |
| check-out | IMPLEMENTED_TOOL | attendance.check_out, attendance.self.check_out | POST /presence/check-out |
| company today | IMPLEMENTED_TOOL | get_team_presence, rh.attendance.today | GET /presence/company/today for RH, /presence/team/today for manager |
| missing check-ins | IMPLEMENTED_TOOL | rh.attendance.missing | Derived from company/team presence tool result; no fake data |
| absent today | IMPLEMENTED_TOOL | rh.attendance.absent | Derived from company/team presence tool result; no fake data |
| late employees | IMPLEMENTED_TOOL | rh.attendance.late | Derived from company/team presence tool result; no fake data |
| manual correction | BACKEND_MISSING | rh.attendance.manual_fix unavailable | No verified Spring endpoint for RH manual pointage correction |
| attendance sync | BACKEND_MISSING | rh.attendance.sync unavailable | No verified Spring endpoint for RH sync command |

## RH Requests

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| leave pending/list | IMPLEMENTED_TOOL | rh.leave.pending, leave.list_requests | GET /rh/conges/rh/pending, GET /rh/conges/me, GET /rh/conges/manager |
| leave approve/reject by employee/date | IMPLEMENTED_TOOL | rh.leave.approve, rh.leave.reject | Pending lookup then PATCH /rh/conges/{id}/valider-rh or PATCH /rh/conges/{id}/refuser-rh |
| telework pending/list | IMPLEMENTED_TOOL | rh.telework.pending, telework.list_requests | GET /rh/teletravail/en-attente-rh, GET /rh/teletravail/mes-demandes, GET /rh/teletravail/demandes-equipe |
| telework approve/reject by employee/date | IMPLEMENTED_TOOL | rh.telework.approve, rh.telework.reject | Pending lookup then PATCH /rh/teletravail/{id}/valider-rh or PATCH /rh/teletravail/{id}/rejeter-rh |
| authorization pending/list | IMPLEMENTED_TOOL | rh.authorization.pending, authorization.list_requests | GET /rh/autorisations/rh/history and status filtering |
| authorization approve/reject by employee/date | IMPLEMENTED_TOOL | rh.authorization.approve, rh.authorization.reject | Pending lookup then PATCH /rh/autorisations/{id}/rh/validate or PATCH /rh/autorisations/{id}/reject |

## Documents

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| documents workload | IMPLEMENTED_TOOL | document.rh_workload, rh.document.workload | GET /documents/rh/demandes |
| document generate AI/PDF | IMPLEMENTED_TOOL | rh.document.generate | POST /documents/rh/generate-ai |
| document upload | VERIFIED_ENDPOINT_NO_TOOL | none | POST /documents/{id}/upload exists; multipart tool not exposed yet |
| document refuse/reject | IMPLEMENTED_TOOL | rh.document.reject | PUT /documents/{id}/refuser |
| urgent documents | IMPLEMENTED_TOOL | rh.document.urgent | Derived from real document workload status/date fields |

## Schedules

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| schedule list | IMPLEMENTED_TOOL | schedule.list, rh.schedule.list | GET /horaires |
| schedule create | IMPLEMENTED_TOOL | schedule.create, rh.schedule.create | POST /horaires |
| schedule assign | IMPLEMENTED_TOOL | schedule.assign, rh.schedule.assign | POST /horaires/assign |
| schedule default/current | IMPLEMENTED_TOOL | schedule.default | GET /horaires/resolve |

## Communication

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| list channels | IMPLEMENTED_TOOL | communication.list_channels | GET /communication/channels |
| read messages | IMPLEMENTED_TOOL | communication.get_channel_messages | GET /communication/channels/{channelId}/messages |
| send message | IMPLEMENTED_TOOL | communication.send_message | POST /communication/channels/{channelId}/messages; confirmation-required write |

## Analytics

| Capability | Classification | Tool | Verified endpoint(s) / notes |
|---|---|---|---|
| RH dashboard | IMPLEMENTED_TOOL | rh.dashboard | GET /rh/dashboard |
| RH stats | IMPLEMENTED_TOOL | rh.stats | GET /rh/stats |
| RH analytics | IMPLEMENTED_TOOL | rh.analytics | GET /rh/stats, GET /rh/stats/evolution-mensuelle, GET /rh/stats/demandes-par-type |

## Remaining Gaps

- RH attendance manual correction and sync remain BACKEND_MISSING until a verified Spring endpoint exists.
- Document upload remains VERIFIED_ENDPOINT_NO_TOOL because the endpoint is multipart and needs a dedicated safe upload contract.
- Dedicated employee/manager update tools are not exposed separately; backend user PUT/PATCH endpoints exist and activation/deactivation use the verified user update contract.
- Payloads for advanced manager/employee creation beyond core identity/role/department/team remain NEEDS_PAYLOAD_CONFIRMATION if additional backend-required fields are introduced.
