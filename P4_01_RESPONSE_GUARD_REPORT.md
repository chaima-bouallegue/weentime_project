# P4-01 Response Guard Report

Date: 2026-05-14
Project: WeenTime AI service
Scope: Response Guard foundation before any local LLM/Ollama provider

## Files changed

- `ai-service/app/guards/__init__.py`
- `ai-service/app/guards/guard_result.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/guards/response_guard.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/tests/test_response_guard.py`
- `ai-service/tests/test_policy_agent.py`
- `ai-service/tests/test_read_tool_response_contract.py`
- `P4_01_RESPONSE_GUARD_REPORT.md`

## Guard architecture

P4-01 adds a small `app.guards` package:

- `GuardResult`: structured allow/reject result with rejection categories.
- `GuardRejection`: category, safe message, and optional safe metadata.
- `GuardRule`: abstract base for individual rules.
- `ResponseGuard`: orchestrates rules and converts unsafe responses to deterministic fallback responses.

The guard operates on `AgentResponse` objects after deterministic agent/tool composition and before API serialization.

## Implemented rule categories

Implemented categories:

- `hallucinated_hr_value`
- `unsupported_status`
- `unsupported_tool_claim`
- `fake_confirmation`
- `missing_citation`
- `secret_leak`
- `unsafe_role_claim`
- `unsafe_tenant_claim`

Rules implemented:

- Blocks obvious fake leave balances, attendance status, request statuses, and HR/user counts when no authoritative `actionResult` exists.
- Blocks policy answers without approved citations unless the response is explicitly a policy-unavailable answer.
- Blocks accidental secret exposure patterns: Authorization headers, Bearer/JWT-like values, common API key names, common API key token formats, and DB/Redis URLs.
- Blocks `execute_action` responses without successful tool evidence.
- Blocks write-success language when no tool/confirmation evidence exists.
- Blocks textual claims of unsupported tool execution when no `toolCalls` exist.
- Blocks unsupported business statuses inside `actionResult` or `toolCalls`.
- Blocks unsafe role claims that contradict `CurrentUserContext.role`.
- Blocks non-admin responses containing tenant IDs that do not match `CurrentUserContext.tenant_id`.

## Fallback strategy

If any rule rejects a response:

- Runtime does not crash.
- The original unsafe response is not returned.
- No raw stacktrace or internal payload is exposed.
- A deterministic fallback `AgentResponse` is returned:
  - `type="error"`
  - `intent="response.guard_rejected"`
  - generic safe text
  - `actionResult.kind="guard_rejection"`
  - category list only, not raw secrets or response text

Fallback text:

```text
Je ne peux pas confirmer cette information sans donnees verifiees. Reessayez avec une demande basee sur les donnees du systeme.
```

## Runtime integration points

Integrated in:

- `app/core/copilot_engine.py`
  - `ensure_copilot_services()` creates/reuses `ResponseGuard`.
  - Normal chat and normal voice routed through `process_copilot_message()` are guarded after localization and before return.
  - The "why"/last-error direct response is also guarded.

- `app/api/chat_v2.py`
  - `/v2/chat/confirm` direct confirmation/rejection responses are guarded before serialization.

- `app/api/voice_v2.py`
  - voice confirmation direct responses are guarded.
  - final `/v2/voice` response path applies the guard even when `process_copilot_message()` is mocked or bypassed in tests.

This means both `/v2/chat` and `/v2/voice` use the guard before responses reach users.

## Tests added or updated

Added:

- `ai-service/tests/test_response_guard.py`

Updated:

- `ai-service/tests/test_policy_agent.py`
- `ai-service/tests/test_read_tool_response_contract.py`

Coverage added:

- fake leave balance blocked.
- fake attendance status blocked.
- fake approval blocked.
- unsupported tool claim blocked.
- policy answer without citations blocked.
- secret leakage blocked.
- safe deterministic response accepted.
- successful read tool response accepted.
- write success without confirmation/tool evidence blocked.
- confirmed write with tool evidence accepted.
- fallback returned when guard rejects.
- unsafe tenant claim blocked.
- unsupported status blocked.
- real HRPolicyAgent cited answer passes guard.
- read result voice path uses signed JWT fixture and preserves guarded read data.

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: `ok`

```powershell
python -m pytest tests/test_response_guard.py tests/test_policy_agent.py tests/test_read_tool_response_contract.py -v
```

Result: `27 passed, 1 warning`

```powershell
python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_tool_registry.py tests/test_response_guard.py -v
```

Result: `23 passed, 1 warning`

Warnings observed:

- `voice/stt.py` imports Python `audioop`, which is deprecated for Python 3.13.
- `pytest_asyncio` warns that `asyncio_default_fixture_loop_scope` is unset.

Both warnings are unrelated to P4-01.

## Remaining limitations

- This is a deterministic guard foundation, not a semantic verifier. It catches high-risk patterns and obvious unsupported claims, but deeper hallucination detection should be added after provider/router design.
- Guard rules are intentionally conservative to avoid breaking existing deterministic tool-backed responses.
- No Ollama/provider output exists yet. Provider integration must call this same guard before returning model-generated text.
- `unsafe_role_claim` currently covers direct role assertions only; future versions can inspect structured provider metadata.
- `unsupported_status` uses a finite known status allow-list that may need updates as backend status enums evolve.
- The guard does not replace ToolRegistry or backend authorization. It is a final response safety layer only.

## Exact files staged for P4-01

Planned staged files:

- `ai-service/app/guards/__init__.py`
- `ai-service/app/guards/guard_result.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/guards/response_guard.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/tests/test_response_guard.py`
- `ai-service/tests/test_policy_agent.py`
- `ai-service/tests/test_read_tool_response_contract.py`
- `P4_01_RESPONSE_GUARD_REPORT.md`

## Commit

Commit message:

```text
feat(ai): add response guard safety layer
```

Commit hash: recorded after commit in the final task response.
