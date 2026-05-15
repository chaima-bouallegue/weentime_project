# P10-07 Manager Intelligence Report

## 1. MCP Tools Used

- `filesystem` MCP: inspected P10-06, P10-05, P10-01 and P2-02 reports, manager agent/copilot code, intelligence package, ToolRegistry-backed leave/telework/authorization/attendance/communication tools, and related tests. It was also used to create this report.
- `context7` MCP: queried LangChain enterprise assistant/tool-boundary guidance for manager copilot, deterministic operational digest, and human approval patterns. Applied guidance: read-only operational intelligence can run automatically, but sensitive/write operations stay behind explicit confirmation and ToolRegistry.
- Postgres MCP was not needed; no schema or private employee rows were inspected.
- Redis MCP was not used; manager intelligence does not use Redis as authority.
- Docker and Playwright were not used.

## 2. Files Changed

- `app/intelligence/manager_digest_builder.py`
- `app/intelligence/team_insight_engine.py`
- `app/intelligence/role_intelligence.py`
- `app/intelligence/priority_engine.py`
- `app/intelligence/__init__.py`
- `app/agents/role_copilots/manager_copilot.py`
- `app/guards/rules.py`
- `tests/test_manager_intelligence.py`
- `tests/test_manager_digest_builder.py`
- `tests/test_manager_copilot.py`
- `tests/test_team_insight_engine.py`
- `P10_07_MANAGER_INTELLIGENCE_REPORT.md`

`app/agents/manager_agent.py` was inspected but not changed. Its approval/refusal path already remains confirmation-based and detail-oriented; P10-07 only changes read-only manager intelligence/digest behavior.

## 3. Manager Intelligence Architecture

Added a dedicated read-only manager intelligence layer:

- `ManagerDigestBuilder`: builds contextual manager digests from modern ToolRegistry read tools.
- `TeamInsightEngine`: derives deterministic manager workload and attendance insights from manager-visible read sections.
- `ManagerCopilot`: now uses `ManagerDigestBuilder` instead of legacy manager reads.
- `RoleIntelligenceService`: uses `ManagerDigestBuilder` for canonical `MANAGER` contexts, keeps `EmployeeDigestBuilder` for employees, and generic `RoleDigestBuilder` for RH/Admin.

Manager digest sections now use modern read tools only:

- `get_team_presence`
- `leave.list_manager_requests`
- `telework.list_manager_requests`
- `authorization.list_manager_requests`
- `communication.list_channels`
- optional `policy.search` if policy-focused role intelligence is requested

No `legacy.get_pending_validations` or `legacy.get_team_requests` is used by the modern manager copilot path.

## 4. Prioritization Strategy

Prioritization is deterministic and evidence-only.

`TeamInsightEngine` emits priorities from:

- pending manager approvals from manager-visible leave/telework/authorization reads
- stale approvals when backend data provides `ageDays`, `daysPending`, `pendingDays`, or parseable created/submitted dates
- attendance anomalies from `get_team_presence`
- communication activity only when backend channel counters exist

`PriorityEngine` was refined so manager team presence and communication sections are not mislabeled as approval workload. Manager workload priority now comes from manager request tools; team presence/communication visibility get separate informational priority types.

No LLM-generated urgency score is used.

## 5. Attendance Anomaly Strategy

Attendance anomalies are derived only from manager-visible `get_team_presence` evidence:

- `team_missing_checkout`: employee/team item has check-in without check-out
- `team_absence`: status contains absence markers
- `team_late_arrival`: status or explicit flags indicate lateness

The output includes evidence such as counts and sample employee names if present. It does not infer hidden attendance state or cross-team data.

## 6. Communication Digest Strategy

Manager communication digest reads `communication.list_channels` only.

- Visible channels are summarized by existing backend/tool results.
- Unread and mention insights are emitted only when backend channel data includes explicit `unreadCount`/mention-like counters.
- No unread counts are invented.
- No channel messages are read unless a future task deliberately adds authorized message-summary behavior.

## 7. Team Visibility Protections

- Manager intelligence uses canonical verified `CurrentUserContext.role` and tenant context.
- Prompt claims such as `je suis admin` do not change the role.
- Non-manager access to `ManagerCopilot` is denied before tool execution.
- All manager digest reads are routed through ToolExecutor/ToolRegistry, preserving role and tenant checks.
- Backend remains the final gate for subordinate/team visibility.
- No manager write/decision tool is called by the intelligence layer.

## 8. Tests Added Or Updated

Added:

- `tests/test_team_insight_engine.py`
- `tests/test_manager_digest_builder.py`
- `tests/test_manager_intelligence.py`
- `tests/test_manager_copilot.py`

Coverage includes:

- manager digest uses verified role and modern read tools
- prompt role claims do not change canonical manager role
- unverified context is rejected before tool calls
- approval workload prioritization is deterministic
- stale approval detection uses real age/date evidence only
- attendance anomaly summaries are deterministic
- communication digest does not fake unread counts
- non-manager access to ManagerCopilot is denied
- ResponseGuard accepts manager digest output
- no manager write/decision tool executes during intelligence/digest generation
- fallback/unavailable sections remain safe

## 9. Validation Results

From `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_manager_intelligence.py tests/test_manager_digest_builder.py tests/test_manager_copilot.py tests/test_team_insight_engine.py -v
```

Result: `18 passed`.

```powershell
python -c "import main; print('ok')"
```

Result: `ok`.

Note: existing optional router warning remains expected: `app.api.document_generation` is optional and unavailable.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_role_intelligence.py tests/test_response_guard.py tests/test_provider_router.py -v
```

Result: `30 passed, 1 warning`.

Additional targeted compatibility check:

```powershell
python -m pytest tests/test_role_copilots.py tests/test_role_digest_builder.py tests/test_role_routing.py -v
```

Result: `26 passed`.

Warnings are existing pytest asyncio configuration warning and the known `audioop` deprecation warning from voice STT under Python 3.11/3.13 compatibility horizon.

## 10. Remaining Limitations

- Manager communication intelligence currently lists visible channels and uses explicit counters only. It does not summarize latest channel messages yet.
- Attendance anomaly detection is conservative and depends on fields returned by `get_team_presence`; no hidden or inferred attendance state is generated.
- Upcoming team absences are represented only when manager-visible request sections expose pending/upcoming request data. No calendar projection is invented.
- Manager approval execution remains in `ManagerAgent`; this task did not change business decision flows.

## 11. Exact Files Staged

Planned P10-07 staging set:

- `ai-service/app/intelligence/manager_digest_builder.py`
- `ai-service/app/intelligence/team_insight_engine.py`
- `ai-service/app/intelligence/role_intelligence.py`
- `ai-service/app/intelligence/priority_engine.py`
- `ai-service/app/intelligence/__init__.py`
- `ai-service/app/agents/role_copilots/manager_copilot.py`
- `ai-service/app/guards/rules.py`
- `ai-service/tests/test_manager_intelligence.py`
- `ai-service/tests/test_manager_digest_builder.py`
- `ai-service/tests/test_manager_copilot.py`
- `ai-service/tests/test_team_insight_engine.py`
- `ai-service/P10_07_MANAGER_INTELLIGENCE_REPORT.md`

## 12. Commit Hash

The commit hash is recorded in the final task response after creating the clean P10-07 commit.
