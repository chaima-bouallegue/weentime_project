# AI Hybrid Implementation Tasks

## Purpose

This document defines small, safe tasks for moving WeenTime AI from deterministic agent/tool orchestration to a local-first, hybrid-ready copilot. Each task preserves the key safety rule: LLM providers never execute HR actions directly. Business actions remain behind ToolRegistry, ToolExecutor, confirmation flow, and backend authorization.

## Global Rules For All Tasks

- Do not reset git.
- Do not delete legacy agents until a later cleanup task with full regression coverage.
- Do not trust frontend `user_id`, role, tenant, or permissions.
- Do not let provider output execute tools directly.
- Do not use fake HR data.
- Do not invent policy answers without approved sources.
- All writes require confirmation.
- Backend authorization remains final gate.
- Keep deterministic fallback working.

## Task AI-HYB-01 - JWT Verification Hardening

**Goal:** Make AI context trust only verified JWTs or backend-validated profiles.

**Impacted files:**

- `ai-service/app/context/jwt_parser.py`
- `ai-service/app/context/context_builder.py`
- `ai-service/app/tools/backend_client.py`
- `ai-service/tests/test_context_builder.py`

**Steps:**

1. Add signature verification support using configured JWT secret or backend introspection endpoint.
2. Keep current parse-only path only for tests with explicit fixture mode.
3. Validate `sub/userId`, role, and tenant claims.
4. Reject payload `user_id` mismatch with controlled 403.
5. Add warning when backend `/users/me` is unreachable, but do not silently accept role mismatch when profile is reachable.

**What not to do:**

- Do not accept frontend role.
- Do not decode JWT without verification in production mode.
- Do not hardcode secrets.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_context_builder.py tests/test_chat_v2.py -v
```

**Risk:** Existing tests may use unsigned fake tokens.

**Rollback:** Revert only context parser/builder changes and restore fixture helper.

**Commit message:** `fix(ai): harden jwt context verification`

## Task AI-HYB-02 - Verified Context Builder Canonical Profile

**Goal:** Make backend `/users/me` canonical for role and tenant when reachable.

**Impacted files:**

- `ai-service/app/context/context_builder.py`
- `ai-service/app/context/current_user.py`
- `ai-service/app/context/permissions.py`
- `ai-service/tests/test_context_builder.py`

**Steps:**

1. Normalize backend role fields into the one-role-only model.
2. If backend returns multiple roles, choose no implicit priority; fail with `invalid_role_state` unless backend has a canonical single role field.
3. Map entreprise/department/team/manager from backend profile.
4. Add tests for tenantless admin and tenant-scoped non-admin.

**What not to do:**

- Do not infer tenant from frontend payload.
- Do not allow role escalation from JWT if backend disagrees.

**Tests:**

```powershell
python -m pytest tests/test_context_builder.py tests/test_admin_tools.py -v
```

**Risk:** Backend profile unavailable in local dev.

**Rollback:** Keep backend profile failure as warning in dev but strict in non-dev.

**Commit message:** `fix(ai): use backend profile as canonical context`

## Task AI-HYB-03 - ToolRegistry Enforcement Audit

**Goal:** Ensure every registered tool has correct type, roles, permissions, confirmation, and idempotency policy.

**Impacted files:**

- `ai-service/app/tools/*.py`
- `ai-service/app/tools/schemas.py`
- `ai-service/app/tools/executor.py`
- `ai-service/tests/test_tool_registry.py`

**Steps:**

1. Emit registry inventory in test logs or debug helper.
2. Assert every write tool has `requires_confirmation=True`.
3. Assert every write tool has idempotency policy or explicit safe exception.
4. Align roles with inspected backend endpoints.
5. Add tests for employee forbidden manager/RH/admin tools.

**What not to do:**

- Do not loosen backend security to match AI.
- Do not add tools for endpoints not verified.

**Tests:**

```powershell
python -m pytest tests/test_tool_registry.py tests/test_attendance_permissions.py tests/test_admin_tools.py -v
```

**Risk:** Existing tools may expose too broad role sets.

**Rollback:** Restore specific ToolDefinition changes.

**Commit message:** `test(ai): enforce tool registry safety contracts`

## Task AI-HYB-04 - Confirmation Durability

**Goal:** Move confirmation state from in-memory only toward persistent/idempotent behavior.

**Impacted files:**

- `ai-service/app/memory/confirmation_store.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/tools/executor.py`
- `ai-service/tests/test_confirmation_error_handling.py`

**Steps:**

1. Define storage interface for confirmations.
2. Keep in-memory default for local mode.
3. Add optional SQLite/PostgreSQL-backed store later via config.
4. Store idempotency key, tool name, payload hash, status, expiry, user, tenant.
5. Return stable response for duplicate confirm.

**What not to do:**

- Do not execute write twice on duplicate confirmation.
- Do not store raw JWT in persistent confirmation.

**Tests:**

```powershell
python -m pytest tests/test_confirmation_error_handling.py tests/test_chat_v2.py -v
```

**Risk:** Serialization of tool payloads.

**Rollback:** Restore in-memory store while keeping duplicate protection tests skipped only if needed.

**Commit message:** `fix(ai): harden confirmation durability contract`

## Task AI-HYB-05 - Provider Interface

**Goal:** Add a provider abstraction without changing agent behavior.

**Impacted files:**

- `ai-service/app/providers/__init__.py`
- `ai-service/app/providers/base.py`
- `ai-service/app/providers/result.py`
- `ai-service/app/providers/router.py`
- `ai-service/config.py`
- `ai-service/tests/test_provider_router.py`

**Steps:**

1. Create `ProviderRequest`, `ProviderResponse`, and `LLMProvider` interface.
2. Add disabled provider implementation.
3. Add ProviderRouter that returns deterministic fallback when disabled.
4. Wire config but do not call providers from business actions yet.

**What not to do:**

- Do not add Ollama yet in this task.
- Do not replace RouterAgent.
- Do not let provider produce tool calls.

**Tests:**

```powershell
python -m pytest tests/test_provider_router.py tests/test_chat_v2.py -v
```

**Risk:** Import cycles with agents.

**Rollback:** Remove provider package only.

**Commit message:** `feat(ai): add llm provider interface`

## Task AI-HYB-06 - Ollama Local Provider

**Goal:** Add local Ollama provider in optional mode.

**Impacted files:**

- `ai-service/app/providers/ollama_provider.py`
- `ai-service/app/providers/router.py`
- `ai-service/config.py`
- `ai-service/requirements.txt` only if a client dependency is necessary; otherwise use `httpx`
- `ai-service/tests/test_ollama_provider.py`

**Steps:**

1. Add config:
   - `AI_PROVIDER_MODE=disabled|ollama`
   - `OLLAMA_BASE_URL=http://localhost:11434`
   - `OLLAMA_MODEL=qwen2.5:7b`
   - `OLLAMA_FALLBACK_MODEL=qwen2.5:3b`
   - `OLLAMA_TIMEOUT_SECONDS=20`
2. Implement CPU-first Ollama HTTP call through `httpx`.
3. Add timeout and model fallback.
4. Return provider unavailable without crashing.
5. Keep disabled mode default.

**What not to do:**

- Do not make Ollama required at startup.
- Do not use cloud provider fallback.
- Do not execute tool calls from model JSON.

**Tests:**

```powershell
python -m pytest tests/test_ollama_provider.py tests/test_provider_router.py -v
```

**Risk:** Local Ollama not installed.

**Rollback:** Set `AI_PROVIDER_MODE=disabled` and revert provider file if needed.

**Commit message:** `feat(ai): add optional ollama provider`

## Task AI-HYB-07 - Deterministic Fallback

**Goal:** Ensure every provider failure returns safe deterministic output.

**Impacted files:**

- `ai-service/app/providers/router.py`
- `ai-service/app/agents/response_composer.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/tests/test_deterministic_fallback.py`

**Steps:**

1. Define fallback reasons: provider disabled, unavailable, timeout, guard rejected, RAG unavailable.
2. Return agent-composed response if provider fails.
3. Add tracing metadata for fallback reason.
4. Add tests with provider timeout and invalid provider response.

**What not to do:**

- Do not expose provider stack traces to frontend.
- Do not invent HR data in fallback.

**Tests:**

```powershell
python -m pytest tests/test_deterministic_fallback.py tests/test_chat_v2.py -v
```

**Risk:** Duplicate text if provider and deterministic both respond.

**Rollback:** Disable provider summarization hook.

**Commit message:** `fix(ai): add deterministic provider fallback`

## Task AI-HYB-08 - Response Guard Foundation

**Goal:** Block unsafe or hallucinated AI output before frontend display.

**Impacted files:**

- `ai-service/app/guards/response_guard.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/tests/test_response_guard.py`

**Steps:**

1. Guard against fake balances, fake statuses, fake request IDs, missing policy citations, unsupported tool names, secrets leakage.
2. Guard provider outputs and optional deterministic summaries.
3. Return deterministic safe response on guard failure.
4. Trace guard failure reason.

**What not to do:**

- Do not block legitimate backend-derived tool results.
- Do not rely on LLM self-checks.

**Tests:**

```powershell
python -m pytest tests/test_response_guard.py tests/test_policy_agent.py tests/test_read_tool_response_contract.py -v
```

**Risk:** Over-blocking useful summaries.

**Rollback:** Disable guard in local config while preserving tests for known dangerous cases.

**Commit message:** `feat(ai): add response guard foundation`

## Task AI-HYB-09 - Braintrust and Local Observability Extension

**Goal:** Add provider, guard, and RAG spans to existing Braintrust/local tracing.

**Impacted files:**

- `ai-service/app/observability/*`
- `ai-service/app/providers/*`
- `ai-service/app/guards/*`
- `ai-service/tests/test_braintrust_real_integration.py`

**Steps:**

1. Add spans: `provider.request`, `provider.response`, `provider.fallback`, `guard.check`, `guard.rejected`, `rag.search`.
2. Preserve redaction of JWT/API keys/emails/audio.
3. Update `/health/deep` with provider and guard status.

**What not to do:**

- Do not require Braintrust API key.
- Do not log raw prompts if `BRAINTRUST_LOG_INPUTS=false`.

**Tests:**

```powershell
python -m pytest tests/test_braintrust_real_integration.py tests/test_request_correlation.py -v
```

**Risk:** Observability exceptions breaking business logic.

**Rollback:** Keep tracing as no-op on exceptions.

**Commit message:** `chore(ai): trace providers guards and rag`

## Task AI-HYB-10 - ChromaDB RAG Foundation

**Goal:** Add local vector RAG for approved tenant HR policy sources.

**Impacted files:**

- `ai-service/app/policy/*`
- `ai-service/app/tools/policy_tools.py`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- `ai-service/tests/test_policy_retriever.py`

**Steps:**

1. Add optional ChromaDB dependency and disabled-by-default config.
2. Add ingestion from approved local source metadata.
3. Store tenant_id/source_id/language/title/path metadata.
4. Query only approved sources for current tenant.
5. Preserve local keyword fallback.

**What not to do:**

- Do not use RAG for live HR state.
- Do not answer policy without citations.
- Do not search cross-tenant.

**Tests:**

```powershell
python -m pytest tests/test_policy_retriever.py tests/test_policy_agent.py -v
```

**Risk:** Native dependency installation issues.

**Rollback:** Set `RAG_PROVIDER=local_keyword` and remove Chroma task changes if needed.

**Commit message:** `feat(ai): add tenant scoped chromadb policy rag`

## Task AI-HYB-11 - CommunicationAgent Modernization

**Goal:** Implement first real CommunicationAgent tools safely.

**Impacted files:**

- `ai-service/app/agents/communication_agent.py`
- `ai-service/app/tools/communication_tools.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/tests/test_communication_agent.py`

**Steps:**

1. Add read tools: list channels, get channel messages, unread summary if endpoint exists.
2. Add summarize-channel using deterministic summary first, provider-assisted later behind Response Guard.
3. Add write tool send message only with confirmation and backend membership/tenant checks.
4. Do not read private messages for unrelated summaries.

**What not to do:**

- Do not bypass communication-service membership checks.
- Do not summarize hidden/private channels.
- Do not send messages without confirmation.

**Tests:**

```powershell
python -m pytest tests/test_communication_agent.py tests/test_tool_registry.py -v
```

**Risk:** Communication-service API drift.

**Rollback:** Keep CommunicationAgent placeholder and unregister tools.

**Commit message:** `feat(ai): add communication copilot tools`

## Task AI-HYB-12 - LangGraph Readiness Adapter

**Goal:** Prepare interfaces for future LangGraph without runtime migration.

**Impacted files:**

- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/agents/base_domain_agent.py`
- `ai-service/app/tools/executor.py`
- `ai-service/docs or markdown task report`

**Steps:**

1. Document graph node boundaries: context, route, plan, tool, guard, compose.
2. Ensure each node can be called as a pure async step.
3. Add no LangGraph dependency yet.
4. Keep ToolRegistry as the only tool authority.

**What not to do:**

- Do not introduce LangGraph runtime.
- Do not rewrite agents into graph nodes yet.

**Tests:**

```powershell
python -m pytest tests/test_chat_v2.py tests/test_tool_registry.py -v
```

**Risk:** Premature abstraction.

**Rollback:** Documentation-only adapter plan can be deferred.

**Commit message:** `docs(ai): define langgraph readiness boundaries`

## Full Validation Commands

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
python -m pytest tests -v

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npm run build
npx tsc --noEmit -p tsconfig.app.json

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests
```
