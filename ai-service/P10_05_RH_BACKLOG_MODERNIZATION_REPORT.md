# P10-05 RH Backlog Modernization Report

## 1. MCP Tools Used

- `filesystem` MCP: used to inspect P10-04, P10-03, P10-02 reports, RH copilot, insight tools, insight engine, document tools, and related tests.
- Postgres MCP was not needed; backend endpoint behavior was already represented in existing modern tool contracts.
- Context7 was optional and not needed because no new framework pattern was introduced.
- Redis and Playwright were not used.

## 2. Remaining Legacy Reads Found

Before this task, the remaining RH backlog/document workload legacy reads were:

- `RHCopilot`: `legacy.get_all_requests`
- `InsightTools.rh_daily`: `legacy.get_all_requests`
- `RHCopilot`: referenced `document.rh_workload`, but no registered modern tool existed yet.

After this task, `legacy.get_all_requests` remains only in the compatibility adapter and tests that assert it is not called by modern RH paths.

## 3. Modern Replacements Applied

RH copilot summary now uses modern read sections:

- `rh.get_stats`
- `leave.list_rh_pending`
- `telework.list_rh_pending`
- `authorization.list_rh_requests`
- `document.rh_workload`

RH insight collection now uses modern read tools:

- `rh.get_stats`
- `leave.list_rh_pending`
- `telework.list_rh_pending`
- `authorization.list_rh_requests`
- `document.rh_workload`

`InsightEngine.rh_daily` now evaluates pending workload from the modern per-domain RH reads and document backlog from `document.rh_workload`.

## 4. Document Workload Strategy

No new backend endpoint was invented.

A new read-only ToolRegistry-backed tool was added:

- Tool: `document.rh_workload`
- Type: read
- Roles: `RH`
- Confirmation: false
- Backend source: existing RH document list endpoint through `DocumentTools._list_accessible_documents()`
- Backend path for RH context: `/documents/rh/demandes`

The tool safely aggregates only backend-returned document requests:

- total count = number of returned documents
- `countsByStatus` = status counts from returned items
- `pendingCount` = count of statuses matching pending/in-progress labels
- no invented unread/request/document counts
- empty backend result returns zero counts and a clean empty summary

## 5. Files Changed

- `app/agents/role_copilots/rh_copilot.py`
- `app/tools/insight_tools.py`
- `app/insights/insight_engine.py`
- `app/insights/anomaly_rules.py`
- `app/tools/document_tools.py`
- `tests/test_role_copilots.py`
- `tests/test_insight_tools.py`
- `tests/test_document_tools.py`
- `P10_05_RH_BACKLOG_MODERNIZATION_REPORT.md`

## 6. Tests Added Or Updated

Updated:

- `tests/test_role_copilots.py`
  - RH copilot no longer calls `legacy.get_all_requests`.
  - RH copilot calls modern per-domain RH request reads and `document.rh_workload`.
- `tests/test_insight_tools.py`
  - RH insight summary no longer calls `legacy.get_all_requests`.
  - RH insight summary collects modern per-domain backlog reads.
  - Insight output includes evidence from `rh.get_stats`, `leave.list_rh_pending`, and `document.rh_workload`.
- `tests/test_document_tools.py`
  - `document.rh_workload` uses `/documents/rh/demandes`.
  - Employee is denied RH workload read.
  - Empty backend document list does not invent counts.

## 7. Validation Results

From `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_role_copilots.py tests/test_insight_tools.py tests/test_document_tools.py tests/test_role_digest_builder.py -v
```

Result: `40 passed`.

```powershell
python -c "import main; print('ok')"
```

Result: passed, printed `ok`.

Note: existing optional router warning remains expected: `app.api.document_generation` is optional and unavailable.

```powershell
python -m pytest tests/test_role_intelligence.py tests/test_response_guard.py tests/test_chat_v2.py -v
```

Result: `24 passed, 1 warning`.

## 8. Remaining Limitations

- Manager insight tools still use legacy manager reads. This was outside P10-05 scope.
- `document.rh_workload` currently aggregates from visible RH document requests only. It does not add separate aging/SLA analysis yet.
- Legacy adapter remains intentionally present for compatibility and ToolRegistry authority tests.

## 9. Exact Files Staged

Planned P10-05 staging set:

- `ai-service/app/agents/role_copilots/rh_copilot.py`
- `ai-service/app/tools/insight_tools.py`
- `ai-service/app/insights/insight_engine.py`
- `ai-service/app/insights/anomaly_rules.py`
- `ai-service/app/tools/document_tools.py`
- `ai-service/tests/test_role_copilots.py`
- `ai-service/tests/test_insight_tools.py`
- `ai-service/tests/test_document_tools.py`
- `ai-service/P10_05_RH_BACKLOG_MODERNIZATION_REPORT.md`

## 10. Commit Hash

The commit hash is recorded in the final task response after creating the clean P10-05 commit.
