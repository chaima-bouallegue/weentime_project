# RH Hybrid Agent 02 Write Tools Report

Date: 2026-05-19
Task: RH-HYBRID-AGENT-02

## MCP Tools Used

- filesystem MCP: read project reports and wrote the required reports.
- postgres MCP: not used; schema verification was not required after Spring controller/tool inspection.
- playwright MCP: not used; no authenticated RH browser session was available in this run.
- docker/redis MCP: not used.

## Screenshots Analyzed

No screenshot files were present in the workspace. I used the screenshot-derived failures listed in the task prompt as the regression targets:

- Affecter employe equipe returned unavailable.
- Generi attestation Amin fell into unsafe fallback after follow-up.
- Valide teletravaille du Amin returned fallback.guard_rejected.
- Arabic سجل الحضور returned a generic summary instead of pointage.
- aamel equipe ai asked for a department name instead of team context.
- RH Agent could not complete real structure/RH writes through tools.

## Backend Tool Gaps

See `RH_BACKEND_TOOL_GAP_REPORT.md` for the detailed classification. Summary:

- IMPLEMENTED_TOOL: organisation structure reads/writes, employee/team assignment, schedules, self attendance, RH company attendance reads, leave/telework/authorization pending and decisions, document workload/generation/reject, RH dashboard/stats/analytics, communication reads/send.
- VERIFIED_ENDPOINT_NO_TOOL: multipart document upload, dedicated employee/manager update tools.
- BACKEND_MISSING: RH attendance manual correction and attendance sync.
- NEEDS_PAYLOAD_CONFIRMATION: expanded user/manager creation contracts if backend requires additional fields beyond the currently verified payload.

## Tools Added Or Connected

Structure:

- organisation.list_departments
- organisation.create_department
- organisation.update_department
- organisation.delete_department
- organisation.list_teams
- organisation.create_team
- organisation.update_team
- organisation.delete_team
- organisation.team_members
- organisation.assign_employee_team
- organisation.assign_manager_team
- organisation.search_employee
- organisation.list_employees
- organisation.create_employee
- organisation.create_manager
- organisation.activate_employee
- organisation.deactivate_employee
- RH aliases: rh.structure.department.*, rh.structure.team.*, rh.structure.employee.*, rh.structure.manager.*

Schedules:

- schedule.list / rh.schedule.list
- schedule.create / rh.schedule.create
- schedule.assign / rh.schedule.assign
- schedule.default

Attendance:

- attendance.self.status / attendance.status
- attendance.self.check_in / attendance.check_in
- attendance.self.check_out / attendance.check_out
- rh.attendance.today
- rh.attendance.missing
- rh.attendance.absent
- rh.attendance.late

Decision tools:

- rh.leave.pending
- rh.leave.approve
- rh.leave.reject
- rh.telework.pending
- rh.telework.approve
- rh.telework.reject
- rh.authorization.pending
- rh.authorization.approve
- rh.authorization.reject

Documents:

- rh.document.workload / document.rh_workload
- rh.document.generate
- rh.document.reject
- rh.document.urgent

Analytics:

- rh.dashboard
- rh.stats
- rh.analytics

## Endpoints Connected

- Organisation: /structure/departments, /structure/teams, /structure/teams/{id}/members, /structure/employees, /structure/managers, /organisations/departements, /organisations/equipes, /organisations/users.
- Presence: /presence/me/today, /presence/check-in, /presence/check-out, /presence/company/today, /presence/team/today, /presence/global/analytics.
- Leave: /rh/conges/rh/pending, /rh/conges/{id}/valider-rh, /rh/conges/{id}/refuser-rh.
- Telework: /rh/teletravail/en-attente-rh, /rh/teletravail/{id}/valider-rh, /rh/teletravail/{id}/rejeter-rh.
- Authorization: /rh/autorisations/rh/history, /rh/autorisations/{id}/rh/validate, /rh/autorisations/{id}/reject.
- Documents: /documents/rh/demandes, /documents/rh/generate-ai, /documents/{id}/refuser.
- Schedules: /horaires, /horaires/assign, /horaires/resolve.
- RH dashboard/stats: /rh/dashboard, /rh/stats, /rh/stats/evolution-mensuelle, /rh/stats/demandes-par-type.
- Communication: /communication/channels, /communication/channels/{channelId}/messages.

## Unsupported Endpoints

- RH pointage manual correction: no verified write endpoint.
- RH pointage sync: no verified write endpoint.
- Document upload: endpoint exists but multipart safe tool is not exposed yet.
- Dedicated employee/manager update: backend endpoint exists, but no separate AI tool was added beyond activation/deactivation and assignment flows.

## RH Write Confirmation Flow

All write actions remain confirmation-gated. The agent now:

- extracts intent/entities deterministically before LLM phrasing,
- asks short slot questions when employee/team/department/date/request type is missing,
- creates a confirmation card when slots are complete,
- executes ToolRegistry only after confirmation,
- reports success only from backend ToolResult success,
- returns clean no_data/capability_unavailable/error cards for no matches, missing endpoints, or backend failures.

## RH Self Pointage Behavior

- Arabic سجل الحضور routes to attendance.self.check_in.
- The attendance agent reads attendance.status first.
- If no entry exists, check-in returns a confirmation card.
- If checkout is requested without an entry, it returns no_data: no checkout confirmation is created.
- Existing checked-in/checked-out state is explained without fake status.

## Assign Employee/Team Behavior

- Generic Affecter employe equipe now asks for missing employee and team slots instead of unavailable.
- Tunisian/French affecti Amin lel frontend searches the real employee/team tools and prepares a confirmation when one match is found.
- Ambiguous employees or teams produce a choose-list from backend search results.
- The backend assignment writes by updating the verified user/team resource and never claims success before ToolResult success.

## Document Generation Flow

- generi/generer/creer attestation routes to rh.document.generate.
- Employee names are resolved through organisation.search_employee.
- Partial names like Amin produce a backend-backed disambiguation prompt when multiple matches exist.
- Follow-up Amin Dupont continues the pending document generation flow instead of falling into unsafe fallback.
- Exact matches produce a confirmation card for rh.document.generate.

## Approve/Refuse By Name And Date

Supported for leave, telework, and authorization in FR/TN/AR/EN:

- request type is detected first,
- employee name is extracted,
- optional date is extracted,
- pending/list tool is called,
- results are filtered by employee, date, and pending status,
- zero matches return no_data,
- one match creates confirmation,
- multiple matches ask the user to choose,
- confirmation executes the backend decision tool.

## Multilingual Support

Added or verified deterministic handling for:

- TN: aamel, zid, warini, affecti, hot, na9el, chkoun, fil, 9bel, orfodh, talab, lyoum, sa7a7, pointach, teletravaille/teletravail/remote, equipe/team, departement, horaire, attestation.
- Arabic: انشئ/أنشئ, اضف/أضف, اعرض, احذف, عين/عيّن, انقل, وافق, ارفض, صحح/صحّح, سجل الحضور, سجل الخروج.
- FR/EN: create/list/update/delete/assign/approve/reject/check-in/check-out/schedule/document variants.

Responses keep a professional French/Tunisian-friendly style for mixed TN/FR prompts.

## No Fake Data Guarantees

- Live employee/team/department/request/document/presence data comes from ToolRegistry backend calls only.
- RAG/Chroma remains restricted to policy/FAQ/rules with citations and is not used for live RH facts.
- Ollama/LLM is not allowed to execute actions or invent employees/counts/statuses.
- ResponseGuard remains active; no success message is returned without backend success.
- Tests cover backend error, missing endpoint, confirmation-only writes, and fake-output rejection.

## Tests Added Or Updated

Added:

- ai-service/tests/test_rh_assignment_tools.py
- ai-service/tests/test_rh_decision_resolution.py
- ai-service/tests/test_rh_document_generation_flow.py
- ai-service/tests/test_rh_self_attendance.py
- ai-service/tests/test_rh_slot_filling_flows.py

Updated:

- ai-service/tests/test_rh_write_tools.py
- ai-service/tests/test_rh_page_context.py
- ai-service/tests/test_rh_agent_chatbot.py
- ai-service/tests/chatbot_test_helpers.py

## Validation Results

AI service:

- `python -c "import main; print('ok')"`: passed. Existing optional router warning: app.api.document_generation is unavailable.
- `python -m pytest tests/test_rh_write_tools.py tests/test_rh_assignment_tools.py tests/test_rh_decision_resolution.py tests/test_rh_document_generation_flow.py tests/test_rh_self_attendance.py tests/test_rh_page_context.py tests/test_rh_multilingual_intents.py tests/test_rh_tool_authority.py tests/test_rh_slot_filling_flows.py -v`: 69 passed.
- `python -m pytest tests/test_rh_agent_chatbot.py tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard_chatbot_outputs.py -v`: 53 passed, 1 deprecation warning from audioop/pytest-asyncio config.

Frontend:

- `npx tsc --noEmit -p tsconfig.app.json`: passed after rerun outside sandbox due Node EPERM lstat sandbox error.
- `npm run build`: passed after rerun outside sandbox due Node EPERM lstat sandbox error. Build warnings are existing bundle/CommonJS/budget warnings.

## Playwright Results

Not run. No authenticated RH browser session was available in the current environment. The covered scenarios are validated through deterministic chatbot/unit tests.

## Remaining Limitations

- RH manual attendance correction and sync remain unavailable until backend endpoints are added.
- Document upload through the agent is not exposed until a multipart ToolRegistry contract is added.
- Dedicated employee/manager update-by-field tools remain future work; activation/deactivation, creation, and assignments are connected.
- The report cannot include the exact hash of the same commit that contains it, because that would be self-referential. The exact commit hash is reported in the final task response after commit.

## Exact Staged Files

Intended staged files for this task:

- RH_BACKEND_TOOL_GAP_REPORT.md
- RH_HYBRID_AGENT_02_WRITE_TOOLS_REPORT.md
- ai-service/app/agents/attendance_agent.py
- ai-service/app/agents/hybrid_intent_router.py
- ai-service/app/agents/organisation_agent.py
- ai-service/app/agents/rh_agent.py
- ai-service/app/agents/routing_priority.py
- ai-service/app/core/slot_filling.py
- ai-service/app/tools/attendance_tools.py
- ai-service/app/tools/authorization_tools.py
- ai-service/app/tools/document_tools.py
- ai-service/app/tools/leave_tools.py
- ai-service/app/tools/organisation_structure_tools.py
- ai-service/app/tools/rh_tools.py
- ai-service/app/tools/schedule_tools.py
- ai-service/app/tools/telework_tools.py
- ai-service/app/workflows/workflow_steps.py
- ai-service/tests/chatbot_test_helpers.py
- ai-service/tests/test_rh_agent_chatbot.py
- ai-service/tests/test_rh_assignment_tools.py
- ai-service/tests/test_rh_decision_resolution.py
- ai-service/tests/test_rh_document_generation_flow.py
- ai-service/tests/test_rh_page_context.py
- ai-service/tests/test_rh_self_attendance.py
- ai-service/tests/test_rh_slot_filling_flows.py
- ai-service/tests/test_rh_write_tools.py

Excluded from staging:

- ai-service.zip
- ai-service/WEENTIME_FULL_AUDIT_REPORT.md

## Commit Hash

Generated after this report is committed; see final task response for the exact hash.
