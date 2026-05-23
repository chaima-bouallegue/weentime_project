# P14-02 Workflow Recovery Report

## MCP tools used

- `filesystem` MCP requested first, but MCP servers were unavailable in this session.
- Verified MCP unavailability through MCP resource listing calls, then used local code inspection as fallback.
- Redis strategy inspected from existing code in `app/events/publisher.py`, `config.py`, and health/monitoring paths.
- PostgreSQL persistence strategy inspected from the `ai-service` codebase: no PostgreSQL client or repository layer currently exists here.

## Files changed

- `app/workflows/session_state.py`
- `app/workflows/session_serializer.py`
- `app/workflows/session_store.py`
- `app/workflows/session_recovery.py`
- `app/workflows/workflow_orchestrator.py`
- `app/workflows/__init__.py`
- `app/core/copilot_engine.py`
- `config.py`
- `tests/test_session_store.py`
- `tests/test_session_recovery.py`
- `tests/test_workflow_continuity.py`
- `tests/test_confirmation_recovery.py`

## Workflow architecture

Added a small persistent continuity layer around the existing orchestrator:

1. `WorkflowOrchestrator` still builds verified context first.
2. After verification, it loads a recoverable session snapshot from `SessionStore`.
3. If a pending slot-filling flow exists, it restores that flow into `ConversationStateStore` before normal routing.
4. If the incoming message is a deterministic recovery token (`continue`, `approve`, `yes`, `complete previous`, voice equivalents), recovery is handled before agent routing.
5. Write execution still goes only through `ConfirmationStore` plus `ToolExecutor(confirmed=True)`.
6. After `ResponseGuard`, the guarded response is persisted as `last_safe_response`.
7. Recent context, tool history, pending confirmation, and pending slot-filling state are refreshed on every guarded response.

## State model

Persisted in `SessionState`:

- `request_id`
- `session_id`
- `user_id`
- `tenant_id`
- `role`
- `language`
- `channel`
- `intent`
- `selected_agent`
- `pending_confirmation`
- `recent_context`
- `tool_history`
- `last_safe_response`
- `pending_flow` (added to support real slot-filling recovery)
- `updated_at`
- `expires_at`

## Safety guarantees

- No write tool executes without confirmation.
- Redis session state is ephemeral only and never treated as business authority.
- Verified context is still mandatory before session recovery.
- Recovery uses deterministic token matching, not prompt inference.
- Only guarded responses are persisted as replayable state.
- Recovery never invents history; it only replays stored `last_safe_response`, stored pending confirmation metadata, or stored slot-filling prompts.
- Tool execution still flows through `ToolRegistry` and `ToolExecutor`.

## Braintrust integration

- Existing Braintrust tracing remains in place.
- Session restore and flow restore emit workflow events through existing tracing helpers.
- No provider output bypasses `ResponseGuard` before persistence.

## Tests added or updated

Added:

- `tests/test_session_store.py`
- `tests/test_session_recovery.py`
- `tests/test_workflow_continuity.py`
- `tests/test_confirmation_recovery.py`

Regression coverage also re-run for:

- `tests/test_workflow_orchestrator.py`
- `tests/test_workflow_state.py`
- `tests/test_chat_workflow_integration.py`
- `tests/test_voice_workflow_integration.py`
- `tests/test_chat_v2.py`
- `tests/test_voice_v2.py`
- `tests/test_response_guard.py`

## Validation results

- `python -c "import main; print('ok')"`: passed
- `python -m pytest tests/test_session_store.py -v`: 2 passed
- `python -m pytest tests/test_session_recovery.py -v`: 4 passed
- `python -m pytest tests/test_workflow_continuity.py -v`: 4 passed
- `python -m pytest tests/test_confirmation_recovery.py -v`: 2 passed
- `python -m pytest tests/test_workflow_orchestrator.py tests/test_workflow_state.py tests/test_chat_workflow_integration.py tests/test_voice_workflow_integration.py tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard.py -v`: 35 passed

## Remaining limitations

- `ai-service` still has no PostgreSQL confirmation repository. Long-lived confirmation authority therefore remains in the in-memory `ConfirmationStore`.
- Redis-backed continuity survives cross-request state loss and fresh orchestrator instances, but not a full process restart if the authoritative confirmation record is gone.
- PostgreSQL inspection in this service found no existing persistence layer to extend safely within this task without introducing a new database stack.

## Exact files staged

- `P14_02_WORKFLOW_RECOVERY_REPORT.md`
- `app/workflows/session_state.py`
- `app/workflows/session_serializer.py`
- `app/workflows/session_store.py`
- `app/workflows/session_recovery.py`
- `app/workflows/workflow_orchestrator.py`
- `app/workflows/__init__.py`
- `app/core/copilot_engine.py`
- `config.py`
- `tests/test_session_store.py`
- `tests/test_session_recovery.py`
- `tests/test_workflow_continuity.py`
- `tests/test_confirmation_recovery.py`

## Commit hash

- Pending until commit is created in this task flow.
