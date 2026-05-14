# P10-06 Employee Intelligence Report

## 1. MCP Tools Used

- `filesystem` MCP: inspected P10/P2/AI-05 reports, current intelligence package, EmployeeCopilot, role intelligence, ToolRegistry-facing read tools, and wrote this report.
- `context7` MCP: queried LangChain enterprise assistant/tool-boundary guidance. Relevant takeaways applied here: keep sensitive/write actions behind human confirmation, use structured outputs, and treat read-tool evidence as the authority for summaries.
- Postgres MCP was not needed; no schema or private rows were inspected.
- Redis MCP was not used; employee reminders do not use Redis as authority.
- Docker and Playwright were not used.

## 2. Files Changed

- `app/intelligence/digest_builder.py`
- `app/intelligence/employee_digest_builder.py`
- `app/intelligence/reminder_engine.py`
- `app/intelligence/role_intelligence.py`
- `app/intelligence/__init__.py`
- `app/agents/employee_agent.py`
- `app/agents/role_copilots/employee_copilot.py`
- `app/guards/rules.py`
- `tests/test_employee_intelligence.py`
- `tests/test_employee_digest_builder.py`
- `tests/test_employee_copilot.py`
- `tests/test_reminder_engine.py`
- `P10_06_EMPLOYEE_INTELLIGENCE_REPORT.md`

## 3. Employee Intelligence Architecture

Added a dedicated read-only employee intelligence layer:

- `EmployeeDigestBuilder`: builds contextual employee digests from modern ToolRegistry read tools.
- `ReminderEngine`: derives deterministic reminders from read-result evidence only.
- `EmployeeAgent`: read-only employee digest agent for future direct employee-intelligence routing.
- `EmployeeCopilot`: now uses `EmployeeDigestBuilder` while preserving the existing `role_summary` response contract.
- `RoleIntelligenceService`: uses `EmployeeDigestBuilder` for canonical `EMPLOYEE` contexts and keeps the existing generic builder for Manager/RH/Admin.

Employee digest sections now include:

- `get_pointage_status`
- `get_week_hours`
- `leave.get_balance`
- `leave.list_my_requests`
- `telework.list_my_requests`
- `authorization.list_my_requests`
- `document.list_my_requests`
- `communication.list_channels`
- optional `policy.search` when the prompt has policy focus

No legacy tools are used in the employee intelligence path.

## 4. Reminder Strategy

Reminder generation is deterministic and evidence-only:

- `missing_checkout`: created only when pointage data shows check-in without check-out.
- `low_leave_balance`: created only from backend leave balance values at or below the configured low-balance threshold.
- `pending_*_requests`: created only from request items whose backend status is pending/in-progress.
- `communication_unread`: created only when backend channel data contains unread or mention counters.

No reminder executes an action. Every reminder has `requiresConfirmation=false` and only recommends the user inspect the relevant module.

## 5. Communication Digest Strategy

The employee digest reads `communication.list_channels` only.

- Visible channels can appear in the digest.
- Unread/mention reminders are emitted only if backend channel data includes explicit counters.
- No unread counts are invented.
- The digest does not read private channels or messages outside backend-visible membership.

## 6. Policy Guidance Integration

When role intelligence detects policy focus, `EmployeeDigestBuilder` appends a `policy.search` section.

- Tenant-scoped approved policy retrieval remains inside policy tools/retriever.
- Citations are preserved in `RoleDigest.citations` and response action data.
- No-citation policy answers remain unavailable through existing policy tooling and ResponseGuard rules.

## 7. Deterministic Prioritization Logic

Employee priorities now combine:

- Reminder priorities from `ReminderEngine`.
- Existing section/count priorities from `PriorityEngine`.

Priority scoring is not LLM-generated. It is derived from read-result status, counts, and evidence from ToolRegistry-backed reads.

## 8. Tests Added Or Updated

Added:

- `tests/test_reminder_engine.py`
- `tests/test_employee_digest_builder.py`
- `tests/test_employee_intelligence.py`
- `tests/test_employee_copilot.py`

Coverage includes:

- verified role source is used instead of prompt role claims
- employee digest uses modern personal read tools
- missing checkout reminder is deterministic
- low leave balance reminder uses real backend balance data
- telework pending reminder is deterministic
- communication digest does not fake unread counts
- policy guidance preserves citations
- non-employee contexts are denied by `EmployeeAgent`
- ResponseGuard accepts employee digest output
- fallback/unavailable sections remain safe
- no write tool or confirmation is created by employee intelligence

## 9. Validation Results

From `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_employee_intelligence.py tests/test_employee_digest_builder.py tests/test_employee_copilot.py tests/test_reminder_engine.py -v
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

- `EmployeeAgent` is available as a read-only direct agent but is not separately wired into the router, because current routing already uses `RoleIntelligenceService` and `EmployeeCopilot` safely.
- Communication intelligence does not summarize channel messages unless future backend-visible message reads are intentionally added to the employee digest. This avoids accidental private-channel expansion.
- Leave and attendance reminders are deterministic and conservative; they do not infer HR policy or availability without backend/policy evidence.
- Manager/RH/Admin digest behavior is unchanged except for shared data/citation serialization support in `RoleDigestSection`.

## 11. Exact Files Staged

Planned P10-06 staging set:

- `ai-service/app/intelligence/digest_builder.py`
- `ai-service/app/intelligence/employee_digest_builder.py`
- `ai-service/app/intelligence/reminder_engine.py`
- `ai-service/app/intelligence/role_intelligence.py`
- `ai-service/app/intelligence/__init__.py`
- `ai-service/app/agents/employee_agent.py`
- `ai-service/app/agents/role_copilots/employee_copilot.py`
- `ai-service/app/guards/rules.py`
- `ai-service/tests/test_employee_intelligence.py`
- `ai-service/tests/test_employee_digest_builder.py`
- `ai-service/tests/test_employee_copilot.py`
- `ai-service/tests/test_reminder_engine.py`
- `ai-service/P10_06_EMPLOYEE_INTELLIGENCE_REPORT.md`

## 12. Commit Hash

The commit hash is recorded in the final task response after creating the clean P10-06 commit.
