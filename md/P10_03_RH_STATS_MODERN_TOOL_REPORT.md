# P10-03 RH Stats Modern Tool Report

## 1. MCP Tools Used

- `filesystem` MCP: used to read P10-01, P10-02, P2-02 reports and inspect AI/backend files.
- Postgres MCP was not needed; endpoint verification was available from backend controller/service source.
- Context7 was optional and not needed because no new framework pattern was introduced.
- Redis and Playwright were not used.

## 2. Endpoint Verification

Verified backend endpoint:

- Method: `GET`
- Gateway path used by AI `BackendClient`: `/rh/stats`
- Full backend controller path: `/api/v1/rh/stats`
- Controller: `weentime-backend/services/rh-service/src/main/java/com/weentime/weentimeapp/controller/RhDashboardCompatibilityController.java`
- Authorization: `@PreAuthorize("hasAnyRole('RH','ADMIN')")`
- Response DTO/envelope: `ApiResponse<Map<String, Object>>`
- Response fields include current backend-derived values such as:
  - `totalEmployees`
  - `presentToday`
  - `absentToday`
  - `pendingRequests`
  - `employeesOnLeave`
  - `totalHoursWorked`
  - `attendanceRate`
  - `absenceRate`
  - `requestTypeDistribution`
  - `requestStatusDistribution`
  - `monthlyRequestEvolution`
  - `departmentEmployeeCounts`

Tenant/identity safety:

- `RhDashboardServiceImpl.getDashboard()` calls `SecurityUtils.getCurrentEntrepriseId()`.
- Backend service loads employees and requests for the backend-authenticated enterprise context.
- AI forwards the verified JWT through `BackendClient`; AI does not accept tenant/user/role from prompt text.

## 3. Files Changed

- `app/tools/rh_tools.py`
- `app/core/copilot_engine.py`
- `app/intelligence/digest_builder.py`
- `tests/test_role_digest_builder.py`
- `tests/test_rh_tools.py`
- `P10_03_RH_STATS_MODERN_TOOL_REPORT.md`

## 4. Tool Registration Details

Added `rh.get_stats`:

- Type: read
- Allowed roles: `RH`, `ADMIN`
- Requires confirmation: false
- Backend path: `/rh/stats`
- Context: verified `CurrentUserContext` forwarded through `BackendClient`
- Tenant source: backend-authenticated security context; no prompt tenant accepted
- Error behavior:
  - 401/403 -> clean role-denied message
  - 404 -> `capability_unavailable` with clean unavailable message
  - 5xx/unreachable -> clean temporary unavailable message

The tool returns stable `read_result` data and does not invent metrics when the backend returns an empty payload.

## 5. RH Digest Changes

Role Intelligence RH digest now uses:

- `rh.get_stats`
- `leave.list_rh_pending`
- `telework.list_rh_pending`
- `authorization.list_rh_requests`
- `document.list_my_requests`
- `communication.list_channels`

Removed from RH Role Intelligence digest:

- `legacy.get_rh_stats`

## 6. Fallback Behavior

There is no fake stats fallback.

If `rh.get_stats` fails or the endpoint is unavailable, Role Intelligence produces an unavailable digest section with a clean user-facing message. It does not fall back to legacy stats inside Role Intelligence because a verified modern endpoint now exists.

Remaining legacy usages outside P10-03 scope:

- `app/agents/rh_agent.py` still uses `legacy.get_rh_stats` for direct RH stats prompts.
- `app/agents/role_copilots/rh_copilot.py` still uses legacy RH stats/all-requests reads.
- `app/tools/insight_tools.py` still uses legacy RH stats for Insight reports.

Those are separate modernization targets and were intentionally not changed in this Role Intelligence task.

## 7. Tests Added Or Updated

Updated:

- `tests/test_role_digest_builder.py`
  - RH digest now asserts `rh.get_stats` is used.
  - RH digest asserts `legacy.get_rh_stats` is no longer used.
  - Unavailable stats produce a clean unavailable section.

Added:

- `tests/test_rh_tools.py`
  - `rh.get_stats` uses `/rh/stats`.
  - Verified token and tenant context are forwarded to the backend client.
  - `ADMIN` can execute when backend allows it.
  - `EMPLOYEE` and `MANAGER` are denied before backend calls.
  - 403/404/unavailable failures return clean read results.
  - Empty backend payload does not invent metrics.
  - Tool is registered as read-only and does not require confirmation.

## 8. Validation Results

From `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed, printed `ok`.

Note: existing optional router warning remains expected: `app.api.document_generation` is optional and unavailable.

```powershell
python -m pytest tests/test_role_digest_builder.py tests/test_tool_registry.py -v
```

Result: `13 passed`.

```powershell
python -m pytest tests/test_rh_tools.py -v
```

Result: `9 passed`.

```powershell
python -m pytest tests/test_role_intelligence.py tests/test_response_guard.py tests/test_chat_v2.py -v
```

Result: `24 passed, 1 warning`.

## 9. Remaining Limitations

- Direct `RHAgent`, older `RHCopilot`, and Insight reports still contain legacy RH stats usage outside Role Intelligence scope.
- `rh.get_stats` depends on the backend RH dashboard compatibility endpoint. If backend role/tenant setup is incomplete, the tool reports unavailable rather than inventing stats.
- The summary uses only scalar fields returned by the backend; nested distributions are preserved in `data` but not expanded into digest text yet.

## 10. Exact Files Staged

Planned P10-03 staging set:

- `ai-service/app/tools/rh_tools.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/intelligence/digest_builder.py`
- `ai-service/tests/test_role_digest_builder.py`
- `ai-service/tests/test_rh_tools.py`
- `ai-service/P10_03_RH_STATS_MODERN_TOOL_REPORT.md`

## 11. Commit Hash

The commit hash is recorded in the final task response after creating the clean P10-03 commit.
