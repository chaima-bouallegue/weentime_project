# P5-01 Manager/RH Approval Modernization Report

## Summary
Modernized ManagerAgent and RHAgent approval/refusal flows to use modern ToolRegistry-backed domain tools where backend endpoints exist. LegacyAgent and legacy HRTools remain available only for unsupported compatibility flows; manager/RH decision paths no longer call `legacy.approve_request`, `legacy.reject_request`, or `legacy.process_request`.

## Backend Endpoints Verified

### Leave
- `GET /api/v1/rh/conges/manager` - MANAGER team leave requests.
- `GET /api/v1/rh/conges/rh/pending` - RH pending leave validations.
- `GET /api/v1/rh/conges/{id}` - EMPLOYEE/MANAGER/RH leave detail.
- `PATCH /api/v1/rh/conges/{id}/valider` and `/validate-manager` - MANAGER approval.
- `PATCH /api/v1/rh/conges/{id}/valider-rh` and `/validate-rh` - RH final approval.
- `PATCH /api/v1/rh/conges/{id}/refuser`, `/refuser-rh`, `/reject` - MANAGER/RH rejection.

### Telework
- `GET /api/v1/rh/teletravail/demandes-equipe` - MANAGER team telework requests.
- `GET /api/v1/rh/teletravail/en-attente-rh` - RH pending telework requests.
- `GET /api/v1/rh/teletravail/{id}` - EMPLOYEE/MANAGER/RH telework detail.
- `PATCH /api/v1/rh/teletravail/{id}/valider-manager` - MANAGER approval.
- `PATCH /api/v1/rh/teletravail/{id}/rejeter-manager` - MANAGER rejection.
- `PATCH /api/v1/rh/teletravail/{id}/valider-rh` - RH approval.
- `PATCH /api/v1/rh/teletravail/{id}/rejeter-rh` - RH rejection.

### Authorization
- `GET /api/v1/rh/autorisations/manager` - MANAGER authorization requests.
- `GET /api/v1/rh/autorisations/rh/history` - RH authorization requests/history.
- `GET /api/v1/rh/autorisations/{id}` - EMPLOYEE/MANAGER/RH authorization detail.
- `PATCH /api/v1/rh/autorisations/{id}/manager/validate` and `/validate/manager` - MANAGER approval.
- `PATCH /api/v1/rh/autorisations/{id}/rh/validate` and `/validate/rh` - RH approval.
- `PATCH /api/v1/rh/autorisations/{id}/reject` and `/refuser` - MANAGER/RH rejection.

### Documents
- `GET /api/v1/documents/rh/demandes` - RH document requests.
- `GET /api/v1/documents/{id}/file` - RH authorized document view.
- `PUT /api/v1/documents/{id}/refuser` - RH document rejection.
- `PUT /api/v1/documents/{id}/valider` exists, but requires generated content or a document URL. The AI does not auto-approve documents without that payload.

## Files Changed
- `ai-service/app/agents/manager_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/tools/leave_tools.py`
- `ai-service/app/tools/telework_tools.py`
- `ai-service/app/tools/authorization_tools.py`
- `ai-service/tests/test_approval_resolution.py`
- `ai-service/tests/test_leave_agent.py`
- `ai-service/tests/test_leave_tools.py`
- `ai-service/tests/test_telework_tools.py`
- `ai-service/tests/test_authorization_tools.py`
- `ai-service/tests/test_modern_hr_agents.py`

## Modern Tools Added/Updated
- Added `leave.list_manager_requests`.
- Added `leave.list_rh_pending`.
- Added `leave.manager_decide`.
- Added `leave.rh_decide`.
- Added `telework.list_manager_requests`.
- Added `telework.list_rh_pending`.
- Added `authorization.list_manager_requests`.
- Added `authorization.list_rh_requests`.

All new write tools require confirmation and idempotency through ToolRegistry.

## Legacy Dependencies Removed
- Manager approval/refusal confirmations now target modern `leave.*`, `telework.*`, or `authorization.*` decision tools.
- RH approval/refusal confirmations now target modern `leave.*`, `telework.*`, `authorization.*`, or safe `document.rh_reject` tools.
- Manager/RH request summaries now use modern domain list tools where verified endpoints exist.

Legacy read/stat tools remain only where not in this task scope, such as RH statistics and older role copilot summaries.

## Confirmation Behavior
- No approval/refusal executes during agent handling.
- Agents first resolve request details through a modern read/detail tool.
- If details are missing, the agent asks for clarification and does not create a confirmation.
- If multiple request domains match the same ID, the agent returns choices and does not create a confirmation.
- Document approval without generated/uploaded content returns capability unavailable instead of pretending the backend can validate it.

## Tests Added/Updated
- Added manager/RH modern pending-list tests.
- Added detail-before-confirmation tests for manager and RH approvals.
- Added ambiguity and forbidden-role tests.
- Added leave manager/RH tool endpoint tests.
- Added telework and authorization manager/RH list endpoint tests.
- Added `tests/test_leave_agent.py` because the validation command references it.

## Validation Results
- `python -c "import main; print('ok')"` -> `ok`
- `python -m pytest tests/test_approval_resolution.py tests/test_role_action_routing.py tests/test_tool_registry.py -v` -> `13 passed`
- `python -m pytest tests/test_leave_agent.py tests/test_telework_authorization_agents.py tests/test_document_agent.py -v` -> `22 passed`
- Additional regression: `python -m pytest tests/test_tool_registry_authority.py tests/test_leave_tools.py tests/test_telework_tools.py tests/test_authorization_tools.py tests/test_modern_hr_agents.py -v` -> `55 passed`

No backend source files were changed, so RH service compile was not required.

## Remaining Limitations
- RH stats still use `legacy.get_rh_stats`; that is outside approval-flow modernization scope.
- Role copilots may still use legacy summary tools and should be modernized in a later task.
- Document approval requires actual generated/uploaded content; AI currently refuses unsupported auto-approval rather than fabricating a document payload.
- Name-based fuzzy request resolution is still limited; ID-based approval is reliable and safe.

## Exact Files Staged
To be staged after final validation:
- `ai-service/app/agents/manager_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/tools/authorization_tools.py`
- `ai-service/app/tools/leave_tools.py`
- `ai-service/app/tools/telework_tools.py`
- `ai-service/tests/test_approval_resolution.py`
- `ai-service/tests/test_authorization_tools.py`
- `ai-service/tests/test_leave_agent.py`
- `ai-service/tests/test_leave_tools.py`
- `ai-service/tests/test_modern_hr_agents.py`
- `ai-service/tests/test_telework_tools.py`
- `P5_01_MANAGER_RH_APPROVAL_MODERNIZATION_REPORT.md`

## Commit Hash
Pending until commit creation. The exact commit hash is recorded in the final task output after `git commit` succeeds.
