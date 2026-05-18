# RH-HYBRID-AGENT-02 Write Tools Report

## MCP tools used

- filesystem MCP: used to read the required reports and inspect active RH agent/tool files.
- postgres MCP: not used; endpoint payloads were verified from backend controller/request DTO source files and the existing backend map.
- playwright MCP: not used; no authenticated RH browser session was available for reliable page validation.

## Files changed

- `ai-service/app/tools/organisation_structure_tools.py`
- `ai-service/app/tools/schedule_tools.py`
- `ai-service/app/agents/organisation_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/tests/chatbot_test_helpers.py`
- `ai-service/tests/test_rh_write_tools.py`
- `RH_HYBRID_AGENT_02_WRITE_TOOLS_REPORT.md`

## Backend endpoints/tools verified

- Departments: `/api/v1/organisations/departements`, including `POST`, `PATCH`, `PUT`, and `DELETE`; request payload uses `nom`, `description`, `codeInterne`, and `entrepriseId`.
- Teams: `/api/v1/organisations/equipes`, including `POST`, `PATCH`, `PUT`, and read endpoints; request payload uses `nom`, `description`, `responsableId`, `effectifMaximum`, `estActive`, and `departementId`.
- Employee/team assignment: no dedicated assign endpoint was verified; the safe path is read-merge-write through `/api/v1/organisations/users/{id}` with required user fields preserved and `equipeId` updated.
- Manager/team assignment: no dedicated assign endpoint was verified; the safe path is read-merge-write through `/api/v1/organisations/equipes/{id}` with required team fields preserved and `responsableId` updated.
- Schedules: `/api/v1/horaires` supports `POST`; `/api/v1/horaires/assign` supports schedule assignment using `horaireId`, `cibleType`, `cibleId`, `dateDebut`, `dateFin`, and `motif`.
- Attendance manual fix: no verified backend correction endpoint was found, so `rh.attendance.manual_fix` remains capability-unavailable/clarification-only.
- Documents: existing `document.rh_generate` remains the verified document generation tool and is reused for RH document generation confirmations.

## Modern write tools connected

- `rh.structure.department.update`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It reads the current department, merges the requested update, then PATCHes the backend.
- `rh.structure.department.delete`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It DELETEs the verified backend endpoint after confirmation.
- `rh.structure.team.create`: registered as a ToolRegistry write alias for RH/ADMIN, confirmation required. It uses the existing verified team creation payload.
- `rh.structure.employee.assign_team`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It reads the user first, preserves required backend fields, and PATCHes the team assignment.
- `rh.structure.manager.assign_team`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It reads the team first, preserves required backend fields, and PATCHes `responsableId`.
- `rh.schedule.create`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It posts to `/horaires`.
- `rh.schedule.assign`: registered as a ToolRegistry write tool, RH/ADMIN only, confirmation required. It posts to `/horaires/assign`.
- `rh.document.generate`: uses existing `document.rh_generate`; no duplicate tool was created.

## Agent wiring

- `OrganisationAgent` now consumes RH hybrid intents for department update/delete, team create, employee team assignment, and manager team assignment.
- Existing `organisation.create_department` behavior was preserved for older tests/contracts, while RH aliases are registered for ToolRegistry compatibility.
- `RHAgent` now prepares confirmations for schedule create and schedule assign when enough slots are present, and asks for missing schedule details otherwise.
- `routing_priority.py` routes employee/manager assignment RH intents to `OrganisationAgent`, not the generic RH fallback.
- `chatbot_test_helpers.py` now provides fake backend reads for departments, teams, and users so write tools can test read-merge-write behavior without fake success claims.

## Confirmation and authority guarantees

- All new RH write tools are registered as `type="write"` and `requires_confirmation=True`.
- Agent responses create pending confirmations only; backend mutations are not executed during initial chat routing.
- Success summaries are emitted only from ToolRegistry execution after the backend returns success.
- Backend failures return structured write-result failures with clean user-facing messages.
- No raw SQL was introduced.
- No fake departments, teams, schedules, users, or document success messages are produced by the agent.

## Capability-unavailable behavior

- `rh.attendance.manual_fix` remains unavailable/clarification-only because no verified backend correction endpoint was found.
- Dedicated assignment endpoints were not invented; assignment uses verified update endpoints with prior reads to preserve required backend fields.
- Document generation remains delegated to the existing verified `document.rh_generate` tool.

## Tests added/updated

- Added `tests/test_rh_write_tools.py` covering:
  - create team asks for missing department.
  - create team returns confirmation when department is present.
  - schedule list remains read-only and still works.
  - schedule create returns confirmation.
  - schedule assign returns confirmation.
  - department delete returns confirmation.
  - document generation uses existing `document.rh_generate` confirmation.
  - employee team assignment returns confirmation.
  - manager team assignment returns confirmation.
  - backend errors return clean failures without fake "Action approved" text.
- Updated fake backend helpers for verified organisation read endpoints used by write tools.

## Validation results

- `python -c "import main; print('ok')"`: passed. Existing optional-router warning for missing `app.api.document_generation` remains unchanged.
- `python -m pytest tests/test_rh_write_tools.py tests/test_rh_hybrid_router.py tests/test_rh_tool_authority.py -v`: passed, 18 tests.
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py -v`: passed, 21 tests, with existing `audioop` deprecation warning.

## Remaining limitations

- No authenticated RH Playwright session was available, so browser validation was not performed.
- `rh.attendance.manual_fix` is still not connected because no safe backend correction endpoint was verified.
- Employee/team and manager/team assignments rely on backend update endpoints rather than dedicated assignment endpoints.
- Department update currently needs a numeric department ID for safe execution.

## Exact files staged

- `RH_HYBRID_AGENT_02_WRITE_TOOLS_REPORT.md`
- `ai-service/app/agents/organisation_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/tools/organisation_structure_tools.py`
- `ai-service/app/tools/schedule_tools.py`
- `ai-service/tests/chatbot_test_helpers.py`
- `ai-service/tests/test_rh_write_tools.py`

## Commit hash

- Pending before commit. The final commit hash is recorded in the task final response because a commit cannot contain its own hash without a follow-up amend.
