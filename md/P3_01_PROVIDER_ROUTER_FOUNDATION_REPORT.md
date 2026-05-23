# P3-01 Provider Router Foundation Report

Date: 2026-05-14
Project: WeenTime AI service
Scope: CPU-only provider abstraction foundation before enabling Ollama

## Files changed

- `ai-service/config.py`
- `ai-service/app/providers/__init__.py`
- `ai-service/app/providers/base.py`
- `ai-service/app/providers/disabled_provider.py`
- `ai-service/app/providers/provider_context.py`
- `ai-service/app/providers/provider_request.py`
- `ai-service/app/providers/provider_response.py`
- `ai-service/app/providers/result.py`
- `ai-service/app/providers/router.py`
- `ai-service/app/providers/types.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/api/health_v2.py`
- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_provider_disabled_mode.py`
- `P3_01_PROVIDER_ROUTER_FOUNDATION_REPORT.md`

## Provider architecture

P3-01 adds a provider abstraction layer only. It does not add Ollama calls, cloud providers, ChromaDB, Redis, n8n, frontend changes, or agent rewrites.

New package:

- `app.providers.base`
  - `LLMProvider` abstract interface.
  - Required methods: `generate()`, `health()`, `provider_name()`.
  - Capability methods: `supports_streaming()` and `supports_tools()`, both false by default.

- `app.providers.provider_request`
  - `ProviderRequest` contract with sanitized prompt, safe context summary, optional citations, and safe metadata.
  - Sanitization removes Authorization/Bearer/JWT strings, API keys, token assignments, DB/Redis URLs, and nested secret fields.

- `app.providers.provider_context`
  - `ProviderContext` is a safe summary of runtime context.
  - It excludes raw JWT, Authorization header, token, email, user id, and unrestricted backend payloads.
  - It includes only role, language, locale, channel, optional intent, request id, tenant-present flag, and permissions.

- `app.providers.provider_response`
  - `ProviderResponse` captures non-authoritative provider output or fallback failure metadata.

- `app.providers.router`
  - `ProviderRouter` validates mode, selects provider, handles provider exceptions, exposes safe health, and can convert provider failures into deterministic fallback `AgentResponse` objects.

## Provider modes

Supported modes are defined but only disabled is implemented in this task:

- `disabled`: implemented and default.
- `ollama`: future mode placeholder only; no HTTP/Ollama calls added.
- `cloud`: future placeholder only; no cloud calls added.

Config added to `config.py`:

- `AI_PROVIDER_MODE`, default `disabled`
- `AI_PROVIDER_MODEL`, default `qwen2.5:3b`
- `AI_PROVIDER_OPTIONAL_MODEL`, default `qwen2.5:7b`
- `AI_PROVIDER_TIMEOUT_SECONDS`, default `20`

This matches the CPU-only strategy: start future local work with `qwen2.5:3b`, consider `qwen2.5:7b` only if latency is acceptable.

## Disabled provider behavior

`DisabledProvider`:

- never calls external services
- never crashes runtime
- reports health as `status=disabled`
- returns `ProviderResponse(success=false, fallback_reason=provider_disabled)` from `generate()`
- declares `supports_tools=false`
- declares `supports_streaming=false`

`ProviderRouter.generate_agent_response()` converts disabled/unavailable provider results into deterministic fallback responses using the P4-02 fallback system.

## Sanitized request strategy

Provider input intentionally does not receive raw authority context.

Sanitized request contains:

- sanitized prompt text
- safe context summary only
- optional sanitized citations for future RAG use
- sanitized metadata

Provider input excludes:

- raw JWTs
- Authorization headers
- access tokens
- API keys
- emails
- user id
- unrestricted backend payloads
- raw tool results unless explicitly transformed later into safe citations/context

## Runtime integration

`copilot_engine` now creates and stores `state.copilot_provider_router` through `ProviderRouter.from_settings(settings)`.

The runtime still behaves deterministically:

- no provider generation is called from `process_copilot_message()`
- domain agents and ToolRegistry remain the active execution path
- ResponseGuard remains the final safety layer
- deterministic fallback remains the safe failure path

Telemetry metadata now includes provider mode on `copilot.request` and `copilot.response` events.

## Observability additions

Provider layer logs safe metadata only:

- `provider.request`
- `provider.response`
- `provider.mode_invalid`
- `provider.timeout`
- `provider.error`

Logged metadata includes provider name, mode, latency, fallback reason, request id, and prompt length. It does not log JWTs, Authorization headers, API keys, DB URLs, or raw secrets.

`/health/deep` now includes provider status under:

- `checks.provider`
- top-level `provider`

## Tests added or updated

Added:

- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_provider_disabled_mode.py`

Coverage added:

- disabled mode works
- provider router selects disabled provider by default
- unsupported provider mode is rejected safely
- provider exceptions trigger deterministic fallback
- ResponseGuard is applied to provider output
- safe provider output remains non-authoritative
- provider request sanitizes prompt, metadata, and safe context
- nested provider payload secrets are redacted
- normal text is preserved by sanitization
- provider router reads settings and keeps default model `qwen2.5:3b`
- copilot services include a disabled provider router

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_provider_router.py tests/test_provider_disabled_mode.py -v
```

Result: `11 passed`

```powershell
python -c "import main; print('ok')"
```

Result: `ok`

```powershell
python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard.py tests/test_tool_registry.py -v
```

Result: `23 passed, 1 warning`

Warnings observed:

- `voice/stt.py` imports Python `audioop`, deprecated for Python 3.13.
- `pytest_asyncio` warns that `asyncio_default_fixture_loop_scope` is unset.

Both warnings are unrelated to P3-01.

## Remaining limitations

- Ollama is not implemented yet by design.
- No provider output is used in the live copilot path yet; this task only adds the safe foundation.
- `ollama` and `cloud` modes are placeholders until future tasks register concrete providers.
- Provider request construction currently supports sanitized prompts and safe context only; future RAG/provider tasks must explicitly decide which citations/context are safe to include.
- The provider layer does not execute tools and must remain behind ToolRegistry and ResponseGuard.

## Exact files staged for P3-01

Planned staged files:

- `ai-service/config.py`
- `ai-service/app/providers/__init__.py`
- `ai-service/app/providers/base.py`
- `ai-service/app/providers/disabled_provider.py`
- `ai-service/app/providers/provider_context.py`
- `ai-service/app/providers/provider_request.py`
- `ai-service/app/providers/provider_response.py`
- `ai-service/app/providers/result.py`
- `ai-service/app/providers/router.py`
- `ai-service/app/providers/types.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/api/health_v2.py`
- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_provider_disabled_mode.py`
- `P3_01_PROVIDER_ROUTER_FOUNDATION_REPORT.md`

## Commit

Commit message:

```text
feat(ai): add provider router foundation
```

Commit hash: recorded after commit in the final task response.
