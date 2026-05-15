# P14-01 Workflow Orchestration Without LangGraph

## MCP tools used

- `filesystem` MCP: requested first, but unavailable in this session (`unknown MCP server`)
- `context7` MCP: unavailable in this session (`unknown MCP server`)
- `redis` MCP: not used
- `postgres` MCP: not used
- `playwright` MCP: not used
- Local fallback after MCP verification: PowerShell file inspection, targeted reads, pytest, and git

## Files changed

- `app/workflows/__init__.py`
- `app/workflows/workflow_state.py`
- `app/workflows/workflow_result.py`
- `app/workflows/workflow_steps.py`
- `app/workflows/workflow_orchestrator.py`
- `app/core/copilot_engine.py`
- `app/api/chat_v2.py`
- `app/api/voice_v2.py`
- `tests/test_workflow_state.py`
- `tests/test_workflow_orchestrator.py`
- `tests/test_chat_workflow_integration.py`
- `tests/test_voice_workflow_integration.py`

## Workflow architecture

The implementation adds a small internal orchestration layer under `app/workflows/` and keeps the existing authority boundary intact:

1. `WorkflowOrchestrator.process_message(...)`
   - builds or validates user context
   - resolves language
   - continues pending slot-filling flow if one exists
   - otherwise routes through `RouterAgent`
   - optionally attempts provider fallback only when explicitly allowed by metadata
   - localizes the response
   - validates the response through `ResponseGuard`
   - falls back deterministically on guard rejection or provider failure

2. `WorkflowOrchestrator.confirm_action(...)`
   - rebuilds or validates verified context
   - looks up the pending confirmation
   - rejects ownership and tenant mismatches
   - executes only `confirmed=True` tool calls through `ToolExecutor`
   - reuses the same guard and deterministic fallback path

3. `WorkflowOrchestrator.maybe_confirm_latest_pending(...)`
   - used by voice confirmation flow
   - resolves the latest pending confirmation for the verified user and tenant

4. `copilot_engine.process_copilot_message(...)`
   - now delegates to the orchestrator instead of reimplementing request flow inline

5. `/v2/chat/confirm` and voice confirmation handling
   - now call the same orchestrator confirmation path instead of duplicating execution logic

## State model

`WorkflowState` contains:

- `request_id`
- `user_id`
- `tenant_id`
- `role`
- `channel`
- `language`
- `intent`
- `selected_agent`
- `read_evidence`
- `pending_confirmation`
- `tool_result`
- `guard_result`
- `fallback_used`
- `error_code`

The orchestrator updates this state from authoritative response data only. Read evidence is extracted from `read_result` payloads or explicit evidence attached by upstream logic such as leave risk analysis.

## Safety guarantees

- No write tool executes on the message path. Write intents return `confirm_action` only.
- Confirmed execution is centralized in `WorkflowOrchestrator.confirm_action(...)`.
- All confirmed writes still go through `ToolExecutor`, which keeps `ToolRegistry` as the only tool authority.
- Verified JWT context remains mandatory for v2 request and confirmation flows.
- Unverified injected context is rejected with `ContextError("unverified_context")`.
- Provider fallback is opt-in and still ends in deterministic fallback on failure.
- Final responses are always passed through `ResponseGuard`.
- No direct backend mutation was added outside registered tools.

## Braintrust integration

- Added orchestration spans with `start_span(...)`:
  - `workflow.orchestrate`
  - `workflow.confirmation`
  - `workflow.confirmation.lookup`
- Added workflow events:
  - `workflow.started`
  - `workflow.completed`
- Braintrust emission relies on the existing tracing bridge in `app.observability.tracing`.
- Added a test that verifies a Braintrust span is emitted when a logger is available.

## Tests added or updated

Added:

- `tests/test_workflow_state.py`
- `tests/test_workflow_orchestrator.py`
- `tests/test_chat_workflow_integration.py`
- `tests/test_voice_workflow_integration.py`

Coverage added:

- chat read workflow
- confirmed write execution
- chat write workflow creates confirmation without autonomous execution
- voice language preservation
- unverified context rejection
- guard rejection fallback
- provider failure fallback
- no autonomous write execution
- Braintrust span emission

Existing suites kept green:

- `tests/test_chat_v2.py`
- `tests/test_voice_v2.py`
- `tests/test_response_guard.py`

## Validation results

Executed from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

1. `python -c "import main; print('ok')"`
   - passed

2. `python -m pytest tests/test_workflow_orchestrator.py tests/test_workflow_state.py -v`
   - 9 passed

3. `python -m pytest tests/test_chat_workflow_integration.py tests/test_voice_workflow_integration.py -v`
   - 4 passed

4. `python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard.py -v`
   - 22 passed

## Remaining limitations

- MCP servers requested by the task were not available in this session, so inspection used local shell fallback after verifying the MCP absence.
- Provider fallback remains explicit and opt-in. The default workflow stays deterministic and domain-agent-first.
- The legacy compatibility path `allow_legacy_without_token` still exists for older non-v2 call sites; it was not expanded and still should not be treated as an authority path.
- Existing repo state contains many unrelated tracked and untracked changes; staging must stay path-specific.

## Exact files staged

- `app/workflows/__init__.py`
- `app/workflows/workflow_state.py`
- `app/workflows/workflow_result.py`
- `app/workflows/workflow_steps.py`
- `app/workflows/workflow_orchestrator.py`
- `app/core/copilot_engine.py`
- `app/api/chat_v2.py`
- `app/api/voice_v2.py`
- `tests/test_workflow_state.py`
- `tests/test_workflow_orchestrator.py`
- `tests/test_chat_workflow_integration.py`
- `tests/test_voice_workflow_integration.py`
- `P14_01_WORKFLOW_ORCHESTRATION_NO_LANGGRAPH_REPORT.md`

## Commit hash

- Self-referential constraint: this report participates in the commit, so the exact final hash is captured from `git log` after commit instead of being embedded here.
