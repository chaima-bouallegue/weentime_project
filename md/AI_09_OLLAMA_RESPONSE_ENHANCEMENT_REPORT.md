# AI-09 — Safe Ollama Response Enhancement Report

## Files Changed

- `config.py`
- `app/agents/response_composer.py`
- `app/workflows/workflow_orchestrator.py`
- `app/guards/rules.py`
- `app/observability/provider_metadata.py`
- `tests/test_provider_usage_chatbot.py`
- `tests/test_ollama_provider.py`
- `tests/test_provider_tracing_slice6.py`
- `tests/test_response_guard_chatbot_outputs.py`

## Goal

Use Ollama/qwen only as a wording and summarization enhancer after deterministic agents and ToolRegistry-backed reads have produced an authoritative response.

## Implementation Summary

- Added a post-tool wording enhancement hook in the workflow finalization path.
- Enhancement is applied only before final `ResponseGuard` validation.
- The deterministic response structure, intent, action result, tool calls, tenant context, and confirmation metadata remain authoritative.
- Provider prompts are sanitized through `ProviderRequest.build`.
- Provider failure leaves the deterministic response intact.
- Confirmation and write execution responses are not enhanced.

## Safe Enhancement Contracts

Enhancement is limited to safe read/summary contracts:

- `read_result`
- `digest`
- `role_intelligence_digest`
- `no_data`
- `capability_unavailable`
- `planning_unavailable`
- `system_status`
- `system_health_report`
- `provider_status_report`
- `redis_status_report`
- `braintrust_status_report`
- `rag_status_report`
- `diagnostics_summary`
- `citation_result`
- `tool_safe_summary`
- `greeting`

Successful read-only tool calls are also eligible when the tool name is read-like and not write-like.

## Explicitly Not Enhanced

- `confirm_action`
- `execute_action`
- responses with `requiresConfirmation=true`
- responses with `confirmationId`
- write-like tool calls such as create, approve, refuse, decide, assign, update, delete, check-in/check-out, and send-message
- error responses

## Safety Guarantees Preserved

- LLM output cannot execute tools.
- LLM output cannot create confirmations.
- LLM output cannot approve/refuse/check-in/check-out directly.
- ToolRegistry remains the only tool execution authority.
- Backend remains authoritative for data and business state.
- ResponseGuard runs after provider wording.
- Unsafe provider rewrites fall back through `fallback.guard_rejected`.

## Metadata Added

Safe response action results now include provider-enhancement metadata when eligible:

- `providerUsed`
- `model`
- `fallbackUsed`
- `enhancementApplied`
- `llmEnhancementReason`
- `enhancementLatencyMs` when available

Observability metadata now marks `llm_used=true` when a safe wording enhancement is actually applied.

## Provider Strategy

- Default local provider remains Ollama.
- Default chat model remains `qwen2.5:3b`.
- Fallback model remains `phi3`.
- Coder model remains `qwen2.5-coder:3b-instruct`.
- Legacy cloud provider API keys are now env-only; no Gemini key value is hardcoded in `config.py`.
- Legacy `DEFAULT_AI_PROVIDER` now defaults to `ollama`.

## ResponseGuard Hardening

`ResponseGuard` now treats provider-enhanced text more strictly than deterministic text. If an enhanced rewrite introduces risky HR/system/user-count/attendance/request claims not supported by the action evidence, the response is rejected as `hallucinated_hr_value`.

## Tests Added/Updated

- Ollama enhancement applies to safe read results.
- Provider disabled keeps deterministic response.
- Provider failure keeps deterministic response with fallback metadata.
- Unsafe provider rewrite is rejected by ResponseGuard.
- Confirmation structure is not enhanced.
- Tool-like provider JSON is not executed.
- Multilingual enhancement preserves language context.
- Provider tracing marks enhancement as LLM usage.
- Settings no longer include hardcoded cloud provider key defaults.

## Validation Results

Passed:

```text
python -c "import main; print('ok')"
```

Output included the existing optional-router warning for `app.api.document_generation`.

Passed:

```text
python -m pytest tests/test_provider_usage_chatbot.py tests/test_provider_router.py tests/test_ollama_provider.py -v
```

Result:

```text
28 passed
```

Passed:

```text
python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py tests/test_multilingual_chatbot_routing.py -v
```

Result:

```text
52 passed, 1 warning
```

Additional guard/provider tracing validation passed:

```text
python -m pytest tests/test_provider_tracing_slice6.py -v
python -m pytest tests/test_response_guard.py tests/test_response_guard_allowlist.py tests/test_response_guard_role_outputs.py -v
```

Results:

```text
13 passed
43 passed
```

## Exact Files Staged

- `ai-service/AI_09_OLLAMA_RESPONSE_ENHANCEMENT_REPORT.md`
- `ai-service/app/agents/response_composer.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/observability/provider_metadata.py`
- `ai-service/app/workflows/workflow_orchestrator.py`
- `ai-service/config.py`
- `ai-service/tests/test_ollama_provider.py`
- `ai-service/tests/test_provider_tracing_slice6.py`
- `ai-service/tests/test_provider_usage_chatbot.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`

## Commit Hash

The final commit hash is recorded in the task completion response after `git commit`.
