# AI-05 Local CPU Model Strategy Report

## Summary
Configured the WeenTime AI provider layer for a local CPU-only Ollama strategy while preserving the existing safety boundaries:

- Default HR/chat model: `qwen2.5:3b`
- Coding/debug model: `qwen2.5-coder:3b-instruct`
- Safe local fallback model: `phi3`
- Provider mode configured as `ollama`
- CPU mode configured with strict timeout and small output budget
- ToolRegistry, ResponseGuard, and deterministic fallback remain authoritative safety layers

No frontend, backend, Redis, n8n, ChromaDB, LangGraph, or cloud provider changes were made.

## MCP / Tooling Notes
The requested MCP resources for filesystem/context7/docker were not exposed in this Codex session:

- `list_mcp_resources` returned no resources.
- `list_mcp_resource_templates` returned no templates.
- Filesystem inspection and edits were performed through the local shell.
- Ollama runtime validation was performed through the local `ollama` CLI.
- Docker CLI probing timed out and was not required because the local Ollama runtime responded successfully.
- Ollama API behavior was cross-checked against official Ollama API documentation for `/api/chat`, `stream: false`, and `options` usage: https://docs.ollama.com/api

## Files Changed

- `ai-service/.env.example`
- `ai-service/config.py`
- `ai-service/app/providers/router.py`
- `ai-service/app/providers/ollama_provider.py`
- `ai-service/tests/test_provider_router.py`
- `ai-service/tests/test_ollama_provider.py`
- `ai-service/AI_05_LOCAL_CPU_MODEL_STRATEGY_REPORT.md`

## Configuration Added / Updated

```env
AI_PROVIDER_MODE=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_CODER_MODEL=qwen2.5-coder:3b-instruct
OLLAMA_FALLBACK_MODEL=phi3
OLLAMA_TIMEOUT_SECONDS=20
OLLAMA_MAX_TOKENS=512
OLLAMA_TEMPERATURE=0.2
AI_LOCAL_DEVICE=cpu
```

## Routing Strategy

Provider routing now annotates Ollama requests with safe model metadata before dispatch:

- Standard HR/copilot chat uses `qwen2.5:3b`.
- Coding/debug requests use `qwen2.5-coder:3b-instruct`.
- Coding/debug detection is deterministic and based on intent, task metadata, and safe prompt markers such as `stacktrace`, `debug`, `bug`, `typescript`, `python`, `java`, `fastapi`, `spring boot`, and `angular`.
- Provider metadata includes the selected model role without exposing JWTs, authorization headers, or secrets.

## Fallback Strategy

The Ollama provider now supports a two-layer fallback:

1. If the primary selected Qwen model returns a non-timeout provider failure, the provider retries with `phi3`.
2. If the request times out, the provider returns a provider timeout failure and the existing deterministic fallback path handles the response.
3. If the fallback model fails, the existing deterministic fallback path remains the final safe response.
4. Provider output remains non-authoritative and must pass ResponseGuard before reaching users.

Timeout behavior intentionally does not retry with `phi3`, because on CPU a second model call after timeout can compound latency.

## CPU Optimizations

- `AI_LOCAL_DEVICE=cpu`
- `OLLAMA_MAX_TOKENS=512`
- `OLLAMA_TEMPERATURE=0.2`
- `OLLAMA_TIMEOUT_SECONDS=20`
- No GPU/CUDA assumptions.
- No streaming complexity added.
- No large context window expansion added.

## Safety Guarantees Preserved

- Ollama cannot execute tools.
- Tool-like JSON from Ollama is treated as plain text.
- ToolRegistry remains the only business action authority.
- Backend remains the final authorization gate.
- ResponseGuard still validates provider output.
- Deterministic fallback remains active for provider failures and guard rejections.
- No JWT, Authorization header, API key, or raw secret is sent to Ollama provider payloads.
- LLM output is marked non-authoritative.

## Health Visibility

The existing `/health/deep` provider check now receives richer Ollama health details through `ProviderHealth.details`:

- `base_url`
- `device`
- `cpu_mode_enabled`
- `chat_model`
- `coder_model`
- `fallback_model`

No secrets or authorization values are included.

## Tests Added / Updated

Updated provider tests cover:

- `qwen2.5:3b` selected for standard copilot requests.
- `qwen2.5-coder:3b-instruct` selected for coding/debug intents.
- `phi3` used after a primary Qwen provider failure.
- Default CPU Ollama settings.
- Provider router exposes coder/fallback model config.
- Existing safety tests for sanitized provider payloads, ResponseGuard, deterministic fallback, and tool-like JSON remain green.

## Validation Results

### Ollama Model Pulls

Commands:

```powershell
ollama pull qwen2.5:3b
ollama pull qwen2.5-coder:3b-instruct
ollama pull phi3
ollama list
```

Result: passed.

Relevant `ollama list` output:

```text
NAME                         ID              SIZE
phi3:latest                  4f2222927938    2.2 GB
qwen2.5-coder:3b-instruct    f72c60cabf62    1.9 GB
qwen2.5:3b                   357c53fb659c    1.9 GB
```

### AI Import Check

```powershell
python -c "import main; print('ok')"
```

Result: passed, output `ok`.

### Provider Router Tests

```powershell
python -m pytest tests/test_provider_router.py -v
```

Result: 6 passed.

### Ollama Provider Tests

```powershell
python -m pytest tests/test_ollama_provider.py -v
```

Result: 13 passed.

### Broader Regression

```powershell
python -m pytest tests/test_chat_v2.py tests/test_response_guard.py tests/test_deterministic_fallback.py -v
```

Result: 27 passed, 1 warning.

Warning: existing `audioop` deprecation warning from `voice/stt.py` under Python 3.11/3.13 compatibility horizon.

## Remaining Limitations

- Ollama manual generation latency was not benchmarked in this task; only model availability and provider tests were validated.
- Docker runtime verification was not used because Docker CLI probing timed out and Ollama CLI was sufficient for local runtime validation.
- `phi3` fallback is provider-level for non-timeout failures; timeout still goes directly to deterministic fallback to avoid CPU latency amplification.
- Cloud providers remain intentionally unimplemented.
- Ollama remains unable to execute tools by design.

## Exact Files Staged

Planned targeted staging only:

```text
ai-service/.env.example
ai-service/config.py
ai-service/app/providers/router.py
ai-service/app/providers/ollama_provider.py
ai-service/tests/test_provider_router.py
ai-service/tests/test_ollama_provider.py
ai-service/AI_05_LOCAL_CPU_MODEL_STRATEGY_REPORT.md
```

## Commit

Commit hash: pending at report creation time. Final commit hash is recorded in the task response after commit.
