# P4-02 Deterministic Fallback Report

Date: 2026-05-14
Project: WeenTime AI service
Scope: Deterministic fallback for provider, RAG, and guard failures before any local LLM provider

## Files changed

- `ai-service/app/models/response_models.py`
- `ai-service/app/core/deterministic_fallback.py`
- `ai-service/app/guards/response_guard.py`
- `ai-service/tests/test_deterministic_fallback.py`
- `ai-service/tests/test_response_guard.py`
- `P4_02_DETERMINISTIC_FALLBACK_REPORT.md`

## Fallback architecture

P4-02 adds a reusable deterministic fallback layer without adding Ollama, Provider Router, ChromaDB, Redis, n8n, cloud fallback, or frontend changes.

New model:

- `FallbackMetadata`
  - `fallback_used`
  - `fallback_reason`
  - `safe_response_type`
  - `provider_used="none"`
  - `guard_status`
  - `request_id`

New builder:

- `deterministic_fallback_response(...)`
  - creates a safe `AgentResponse`
  - never returns rejected provider/guard text
  - never includes raw JWTs, API keys, Authorization headers, DB URLs, or raw secrets
  - includes safe metadata for debugging
  - preserves request correlation through `request_id`

The fallback is intentionally provider-neutral. It prepares the future provider/router work while keeping the current deterministic runtime unchanged.

## Fallback reasons added

Allowed fallback reasons:

- `provider_disabled`
- `provider_unavailable`
- `provider_timeout`
- `provider_invalid_output`
- `guard_rejected`
- `rag_unavailable`
- `rag_missing_citations`
- `unsupported_tool`
- `unsafe_response`

Unknown reasons are coerced to `unsafe_response` rather than exposed to the user.

## Guard integration behavior

`ResponseGuard.guard_response()` now delegates rejected responses to `deterministic_fallback_response("guard_rejected", ...)`.

Behavior:

- rejected text is not returned
- rejected payload is not copied into `actionResult`
- only safe categories are exposed through `guard_status` and `guard_reasons`
- fallback metadata records `fallback_reason="guard_rejected"`
- observability logs only safe metadata such as category, intent, response type, fallback reason, provider `none`, and request id

## Localization behavior

Fallback text supports:

- French (`fr`)
- English (`en`)
- Arabic (`ar`)
- Tunisian/franco fallback (`tn`)

The locale is derived from `CurrentUserContext.language`, `metadata.language`, and Tunisian lexical hints in `metadata.original_text`.

The fallback remains conservative. It does not invent leave balances, attendance status, request status, users, request IDs, policies, or action success.

## Tests added or updated

Added:

- `ai-service/tests/test_deterministic_fallback.py`

Updated:

- `ai-service/tests/test_response_guard.py`

Coverage added:

- provider-disabled fallback metadata
- guard rejection fallback hides rejected output
- unsupported tool claims fall back safely
- RAG missing citations returns policy-safe fallback
- fallback does not invent leave balance
- fallback does not invent attendance status
- request id is preserved in fallback metadata
- Arabic-safe fallback is available
- fallback/log metadata does not contain raw bearer/JWT material
- existing Response Guard rejection tests use the new deterministic fallback contract

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: `ok`

```powershell
python -m pytest tests/test_deterministic_fallback.py tests/test_response_guard.py -v
```

Result: `22 passed`

```powershell
python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_tool_registry.py -v
```

Result: `10 passed, 1 warning`

Warnings observed:

- `voice/stt.py` imports Python `audioop`, deprecated for Python 3.13.
- `pytest_asyncio` warns that `asyncio_default_fixture_loop_scope` is unset.

Both warnings are pre-existing and unrelated to P4-02.

## Remaining limitations

- No provider router exists yet; this task only prepares the fallback contract.
- Provider timeout/unavailable behavior is currently tested through the fallback builder, not a real provider runtime.
- RAG fallback is conservative and does not replace the policy retriever. It only ensures future RAG failures have a safe response shape.
- The Response Guard remains pattern/rule based; deeper semantic checking can be added after provider integration.

## Exact files staged for P4-02

Planned staged files:

- `ai-service/app/models/response_models.py`
- `ai-service/app/core/deterministic_fallback.py`
- `ai-service/app/guards/response_guard.py`
- `ai-service/tests/test_deterministic_fallback.py`
- `ai-service/tests/test_response_guard.py`
- `P4_02_DETERMINISTIC_FALLBACK_REPORT.md`

## Commit

Commit message:

```text
fix(ai): guarantee deterministic fallback
```

Commit hash: recorded after commit in the final task response.
