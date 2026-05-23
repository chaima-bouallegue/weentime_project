# P3-02 Optional Ollama CPU Provider Report

Date: 2026-05-14
Project: WeenTime AI service
Scope: Optional local Ollama provider for CPU-only usage

## Files changed

- `ai-service/config.py`
- `ai-service/app/providers/__init__.py`
- `ai-service/app/providers/ollama_provider.py`
- `ai-service/app/providers/router.py`
- `ai-service/tests/test_ollama_provider.py`
- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_deterministic_fallback.py`
- `P3_02_OLLAMA_CPU_PROVIDER_REPORT.md`

## Config added

Configuration fields added or finalized:

- `AI_PROVIDER_MODE=disabled|ollama`
  - default: `disabled`
- `OLLAMA_BASE_URL=http://localhost:11434`
- `OLLAMA_MODEL=qwen2.5:3b`
- `OLLAMA_FALLBACK_MODEL=`
- `OLLAMA_TIMEOUT_SECONDS=20`
- `OLLAMA_MAX_TOKENS=512`
- `OLLAMA_TEMPERATURE=0.2`
- `AI_LOCAL_DEVICE=cpu`

Existing provider-router defaults remain:

- `AI_PROVIDER_MODEL=qwen2.5:3b`
- `AI_PROVIDER_OPTIONAL_MODEL=qwen2.5:7b`
- `AI_PROVIDER_TIMEOUT_SECONDS=20`

`AI_PROVIDER_MODE` remains disabled by default, so Ollama is not required for app import, app startup, tests, or normal deterministic runtime.

## CPU-only model decision

Current CPU-first model:

- `qwen2.5:3b`

Optional later model:

- `qwen2.5:7b`, only if manual latency testing is acceptable on the target machine.

No GPU, CUDA, cloud provider, or cloud fallback was added.

## Ollama provider behavior

Added `OllamaProvider` in `app/providers/ollama_provider.py`.

Behavior:

- uses `httpx`, already present in project dependencies
- calls Ollama `/api/chat`
- sends `stream=false`
- sends model from `OLLAMA_MODEL`
- sends `options.temperature`
- sends `options.num_predict`
- supports `message.content` response parsing
- supports fallback parsing of `response` or top-level `content` text
- handles connection errors safely
- handles timeouts safely
- handles invalid JSON safely
- handles empty responses safely
- exposes health through `/api/tags`

Provider capabilities:

- `supports_streaming=false`
- `supports_tools=false`

Tool-like JSON from Ollama is treated as plain text and is never executed.

## Request safety

The provider receives only a sanitized `ProviderRequest`:

- sanitized prompt
- safe role/language/channel/intent/tenant-present context summary
- optional sanitized citations later
- sanitized metadata

The request excludes:

- raw JWT
- Authorization header
- access token
- API keys
- email
- user id
- unrestricted backend payloads

Tests verify that Bearer/JWT/API-key-like strings do not reach the outgoing Ollama payload.

## Fallback behavior

Failure cases return structured provider failures that `ProviderRouter.generate_agent_response()` converts to deterministic fallback responses:

- connection refused -> `provider_unavailable`
- timeout -> `provider_timeout`
- invalid JSON -> `provider_invalid_output`
- empty response -> `provider_invalid_output`

Fallback responses use the P4-02 deterministic fallback system and do not invent HR data, attendance status, leave balances, request status, users, or action success.

## Guard integration

Provider output is non-authoritative. When converted to an `AgentResponse`, it has:

- `type=answer`
- `intent=provider.response`
- `requiresConfirmation=false`
- `toolCalls=[]`
- `actionResult.kind=provider_response`
- `actionResult.authoritative=false`

If a `ResponseGuard` is provided, provider output is guarded before return. Tests verify fake leave-balance text from Ollama is rejected and converted to deterministic fallback.

## Tests added or updated

Added:

- `ai-service/tests/test_ollama_provider.py`

Updated:

- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_deterministic_fallback.py`

Coverage added:

- Ollama provider not required when provider mode is disabled
- mode `ollama` registers `OllamaProvider` from settings
- Ollama provider calls `/api/chat`
- connection error triggers deterministic fallback
- timeout triggers deterministic fallback
- invalid JSON triggers deterministic fallback
- empty response triggers deterministic fallback
- sanitized request does not include JWT/secrets/email/user id
- default CPU model is `qwen2.5:3b`
- provider output passes through ResponseGuard
- tool-like JSON from model is treated as text and not executed

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_ollama_provider.py tests/test_provider_router.py tests/test_deterministic_fallback.py -v
```

Result: `26 passed`

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

Both warnings are unrelated to P3-02.

## Manual Ollama test result

Manual Ollama runtime test was not performed. It is optional for this task and should only be run when Ollama is installed locally:

```powershell
ollama pull qwen2.5:3b
ollama run qwen2.5:3b
```

Automated tests use mocked `httpx.MockTransport`; Ollama installation is not required.

## Remaining limitations

- Ollama output is not yet used in the live copilot response path. The deterministic agent/tool runtime remains primary.
- No cloud provider was added.
- No provider tool calling was added.
- No streaming support was added.
- `OLLAMA_FALLBACK_MODEL` is available but blank by default; `qwen2.5:7b` should only be tested manually if CPU latency is acceptable.
- Future tasks must decide exactly where provider-assisted explanation/summarization is safe to call.

## Exact files staged for P3-02

Planned staged files:

- `ai-service/config.py`
- `ai-service/app/providers/__init__.py`
- `ai-service/app/providers/ollama_provider.py`
- `ai-service/app/providers/router.py`
- `ai-service/tests/test_ollama_provider.py`
- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_deterministic_fallback.py`
- `P3_02_OLLAMA_CPU_PROVIDER_REPORT.md`

## Commit

Commit message:

```text
feat(ai): add optional cpu ollama provider
```

Commit hash: recorded after commit in the final task response.
