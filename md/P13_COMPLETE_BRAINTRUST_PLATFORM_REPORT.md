# P13 Complete Braintrust Observability Platform Report

## 1. MCP Tools Used

- filesystem MCP: inspected AI service `app/core`, `app/providers`, `app/tools`, `app/intelligence`, `app/voice`, `app/policy`, `app/context`, `app/api`, observability, request correlation, provider routing, RAG, voice, and confirmation paths.
- context7 MCP: reviewed Braintrust tracing/evaluation patterns, nested spans, custom scorer structure, and evaluation dataset conventions.
- redis/postgres/docker/playwright: not required for implementation. Redis remains infrastructure-only and non-authoritative.

## 2. Files Changed

- `ai-service/main.py`
- `ai-service/app/api/health_v2.py`
- `ai-service/app/intelligence/admin_diagnostics.py`
- `ai-service/app/intelligence/role_intelligence.py`
- `ai-service/app/memory/confirmation_store.py`
- `ai-service/app/observability/__init__.py`
- `ai-service/app/observability/braintrust_logger.py`
- `ai-service/app/observability/metrics.py`
- `ai-service/app/observability/monitoring.py`
- `ai-service/app/observability/redaction.py`
- `ai-service/app/observability/request_trace.py`
- `ai-service/app/policy/policy_retriever.py`
- `ai-service/app/providers/router.py`
- `ai-service/app/tools/executor.py`
- `ai-service/app/voice_pipeline/voice_request_processor.py`
- `ai-service/evaluations/**`
- `ai-service/tests/test_admin_monitoring.py`
- `ai-service/tests/test_braintrust_tracing.py`
- `ai-service/tests/test_eval_chat.py`
- `ai-service/tests/test_eval_rag.py`
- `ai-service/tests/test_eval_voice.py`
- `ai-service/tests/test_observability.py`
- `ai-service/tests/test_scorers.py`

## 3. Observability Architecture

P13 adds a safe observability layer around the existing deterministic AI runtime:

- `braintrust_logger.py`: safe Braintrust observation/span helpers layered on existing lazy Braintrust client.
- `metrics.py`: in-memory operational counters and latency summaries for provider, tools, RAG, voice, confirmations, role intelligence, and request lifecycle.
- `request_trace.py`: request lifecycle tracing helper that records endpoint, status, latency, and request id.
- `monitoring.py`: admin-safe AI monitoring snapshot combining Braintrust status, provider config, Redis status, RAG status, and metrics.

The observability layer redacts JWTs, Authorization headers, API keys, DB/Redis URLs, password-like assignments, audio payloads, and configured Braintrust key values.

## 4. Tracing Hierarchy

Implemented and/or connected span/metric hierarchy:

```text
Request
├── ContextBuilder (existing runtime spans)
├── ProviderRouter
│   ├── provider.request
│   ├── provider.response
│   └── provider fallback metrics
├── ToolRegistry / ToolExecutor
│   ├── tool.request
│   ├── tool.execute.finished
│   └── tool.result.normalized
├── Role Intelligence
│   └── role_intelligence.digest
├── RAG
│   ├── rag.search
│   ├── rag.search.result
│   └── rag fallback/citation metrics
└── Voice
    ├── voice.audio.store
    ├── voice.stt
    ├── voice.cleaner
    ├── voice.language.detect
    ├── voice.tts
    └── voice.response.normalize
```

Request lifecycle is captured through FastAPI middleware and includes safe request id propagation.

## 5. Datasets

Created deterministic local evaluation datasets:

- Chat/role datasets: employee, manager, RH, admin examples.
- Multilingual chat dataset: French, English, Arabic, Tunisian.
- Policy RAG dataset: leave, telework, attendance, cross-tenant leakage scenario.
- Voice dataset: FR/EN/AR/TN leave and Tunisian pointage/authorization examples.

These datasets are local Python fixtures and can later be wrapped with Braintrust Eval runs.

## 6. Scorers

Created custom scorers:

- `hallucination_score.py`: penalizes invented leave counts, approvals, unread counts, and unsupported health claims without evidence.
- `tenant_leak_score.py`: detects forbidden tenant references and tenant mismatches.
- `citation_score.py`: requires valid citations for policy/RAG answers.
- `role_score.py`: detects role-boundary violations.
- `confirmation_score.py`: verifies write actions still require confirmation and are not executed directly.
- `routing_score.py`: verifies expected intent routing.
- `multilingual_score.py`: verifies locale/detected language compatibility.

## 7. Multilingual Evaluation

Multilingual evaluation covers:

- French: `je veux un conge demain`
- English: `I need leave tomorrow`
- Arabic: `أريد إجازة غدا`
- Tunisian: `nheb conge ghodwa`, `nheb npointi`, `nheb autorisation`

The scorer accepts Tunisian responses as `tn` or Tunisian-friendly `fr` where appropriate.

## 8. RAG Evaluation

RAG evaluation measures:

- citation coverage
- tenant leakage rate
- hallucination safety
- fallback-safe answers

RAG observability records provider, tenant scope, retrieved document count, citation count, fallback usage, duration, and success flag. Query text is not logged; only query length is captured.

## 9. Voice Evaluation

Voice evaluation measures:

- detected language metadata
- intent routing
- response locale
- confirmation safety for write-like voice intents

Voice runtime metrics capture STT/TTS duration, detected language, audio duration, fallback path, and success/failure without logging audio bytes.

## 10. Monitoring Strategy

Admin operational monitoring now safely exposes:

- provider mode and model names (`qwen2.5:3b`, coder model, fallback model)
- CPU device mode
- Redis enabled/no-op status
- RAG provider/Chroma/citation settings
- Braintrust status
- aggregated observability counters and latencies

Monitoring remains read-only. It does not become authority and does not trigger actions.

## 11. Tests

Added tests:

- `tests/test_braintrust_tracing.py`
- `tests/test_observability.py`
- `tests/test_eval_chat.py`
- `tests/test_eval_rag.py`
- `tests/test_eval_voice.py`
- `tests/test_scorers.py`
- `tests/test_admin_monitoring.py`

Regression suites were also run for provider, tools, RAG, voice, response guard, role intelligence, and full AI tests.

## 12. Validation Results

Commands executed:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
python -m pytest tests/test_braintrust_tracing.py -v
python -m pytest tests/test_eval_chat.py -v
python -m pytest tests/test_eval_rag.py -v
python -m pytest tests/test_eval_voice.py -v
python -m pytest tests/test_scorers.py -v
python -m pytest tests/test_admin_monitoring.py -v
python -m pytest tests -v
```

Results:

- Import check: `ok`
- P13 targeted tests: passed
- Affected regression suites: passed
- Full suite: `554 passed, 6 warnings`

Known warnings are existing dependency/runtime warnings: pytest-asyncio loop scope, `audioop` deprecation, Redis dependency distutils warning, and ctranslate2/pkg_resources warning.

Braintrust dashboard manual validation was not performed in this terminal session. Code paths log safely through the existing configured Braintrust client when enabled.

## 13. Remaining Limitations

- Evaluation modules are deterministic local runners; production Braintrust Eval execution can be wired to run these datasets/scorers in CI or scheduled jobs later.
- Metrics are in-memory process-local counters; they are suitable for current local observability and admin diagnostics, not distributed long-term metrics storage.
- Redis remains realtime infrastructure only and is not used for observability authority.
- RAG evaluation uses local fixtures and scorer contracts; it does not require live ChromaDB or embedding model availability.

## 14. Exact Files Staged

To be staged after final review, only P13 files listed in section 2.

## 15. Commit Hash

Pending until commit creation. The final assistant response will include the commit hash because this report is included in that commit.
