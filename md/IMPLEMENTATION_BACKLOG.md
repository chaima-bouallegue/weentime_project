# Implementation Backlog

## Backlog Rules

- Each task must be independently shippable.
- Do not reset git.
- Do not delete unrelated files.
- Do not commit failing code.
- Do not use fake HR data.
- Do not bypass backend security.
- Do not let LLM providers execute tools directly.
- Backend remains authority for business actions.
- Every write action requires confirmation.
- Every task must produce or update a task report.

## Standard Validation Commands

### AI

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
python -m pytest tests -v
```

### Frontend

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

### Gateway

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests
```

## P0-01 - Repository Baseline and Config Drift Report

**Goal:** Establish a clean baseline of actual ports, routes, service configs, AI defaults, and dirty worktree before implementation.

**Impacted files:**

- New report only: `P0_01_BASELINE_CONFIG_DRIFT_REPORT.md`.

**Steps:**

1. Record `git status -sb`.
2. Inspect gateway route config and config-server profiles.
3. Record AI `BACKEND_BASE_URL` default and frontend environment gateway URL.
4. Record service ports: gateway `8322`, services `819x`, and any older `8222/809x` references.
5. Document exact correction plan, but do not change code in this task.

**What not to do:**

- Do not edit configs.
- Do not normalize ports yet.
- Do not commit unrelated dirty files.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
```

**Expected output:** Baseline report with source file references and drift table.

**Risk:** None; documentation only.

**Rollback:** Delete only the report if incorrect.

**Commit message:** `docs: add repository baseline config drift report`

## P1-01 - Gateway and Security Stabilization

**Goal:** Standardize gateway/base URL configuration across frontend and AI without hardcoding business logic.

**Impacted files:**

- `ai-service/config.py`
- frontend environment files.
- `weentime-backend/services/gateway/src/main/resources/application.yml`
- config-server gateway/service config if applicable.

**Steps:**

1. Choose local profile standard: either `8322/819x` or migrate all local docs/config to `8222/809x`.
2. Update AI `BACKEND_BASE_URL` default only if project standard changes.
3. Update frontend environment API/gateway URLs consistently.
4. Verify gateway paths for `/api/v1/*` and websocket routes.
5. Add a health/deep check note for effective backend base URL.

**What not to do:**

- Do not edit business endpoints.
- Do not disable security.
- Do not bypass gateway.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests

cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npx tsc --noEmit -p tsconfig.app.json
```

**Expected output:** One consistent local base URL path for AI and frontend.

**Risk:** Existing local scripts may expect old ports.

**Rollback:** Revert config/env changes only.

**Commit message:** `fix(config): align gateway base urls`

## P2-01 - AI ContextBuilder JWT Verification Hardening

**Goal:** Ensure AI context is verified and backend profile is canonical.

**Impacted files:**

- `ai-service/app/context/jwt_parser.py`
- `ai-service/app/context/context_builder.py`
- `ai-service/app/context/permissions.py`
- `ai-service/tests/test_context_builder.py`

**Steps:**

1. Add JWT signature verification or backend validation path.
2. Add strict mode for production and compatibility mode for tests/dev only.
3. Reject mismatched payload `user_id`.
4. Verify one-role-only context.
5. Add tenantless admin handling.

**What not to do:**

- Do not trust frontend role.
- Do not log raw JWT.
- Do not hardcode secret.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_context_builder.py tests/test_chat_v2.py -v
```

**Expected output:** Invalid/mismatched JWT paths fail safely.

**Risk:** Tests using fake tokens need helper updates.

**Rollback:** Restore previous parser and keep tests documenting gap.

**Commit message:** `fix(ai): verify authenticated user context`

## P2-02 - ToolRegistry Authority Audit

**Goal:** Make ToolRegistry contracts match backend role/security rules.

**Impacted files:**

- `ai-service/app/tools/*.py`
- `ai-service/tests/test_tool_registry.py`
- Domain-specific tool tests.

**Steps:**

1. Inventory all `ToolDefinition` registrations.
2. Confirm read/write type.
3. Confirm allowed roles match backend annotations.
4. Confirm write tools require confirmation.
5. Confirm idempotency policy on write tools.
6. Add tests for forbidden roles.

**What not to do:**

- Do not weaken backend to satisfy AI.
- Do not register tools for unverified endpoints.

**Tests:**

```powershell
python -m pytest tests/test_tool_registry.py tests/test_attendance_permissions.py tests/test_admin_tools.py -v
```

**Expected output:** ToolRegistry becomes an enforceable safety boundary.

**Risk:** Some current tools may become unavailable for roles that previously passed.

**Rollback:** Revert specific role-set changes if backend evidence proves mismatch.

**Commit message:** `test(ai): enforce tool registry authority`

## P3-01 - Provider Interface

**Goal:** Add local-first provider abstraction with disabled mode default.

**Impacted files:**

- `ai-service/app/providers/*`
- `ai-service/config.py`
- `ai-service/tests/test_provider_router.py`

**Steps:**

1. Define provider request/response models.
2. Add `DisabledProvider`.
3. Add `ProviderRouter`.
4. Wire config without using provider in business actions.
5. Add health status.

**What not to do:**

- Do not add Ollama yet.
- Do not replace deterministic routing.
- Do not allow provider tool calls.

**Tests:**

```powershell
python -m pytest tests/test_provider_router.py tests/test_chat_v2.py -v
```

**Expected output:** Provider layer exists but remains disabled by default.

**Risk:** Import cycles.

**Rollback:** Remove provider package and config fields.

**Commit message:** `feat(ai): add provider router foundation`

## P3-02 - Ollama Local Provider

**Goal:** Add optional Ollama provider with `qwen2.5:7b` first and `qwen2.5:3b` fallback.

**Impacted files:**

- `ai-service/app/providers/ollama_provider.py`
- `ai-service/app/providers/router.py`
- `ai-service/config.py`
- `ai-service/tests/test_ollama_provider.py`

**Steps:**

1. Add Ollama config fields.
2. Implement `httpx` call to `/api/chat` or `/api/generate`.
3. Add timeout.
4. Add fallback model.
5. Return deterministic fallback when Ollama is unavailable.

**What not to do:**

- Do not require Ollama for app startup.
- Do not send JWT/API keys to Ollama.
- Do not use provider for write actions.

**Tests:**

```powershell
python -m pytest tests/test_ollama_provider.py tests/test_provider_router.py -v
```

**Expected output:** Optional local provider works in mocked tests.

**Risk:** Slow local model in manual testing.

**Rollback:** Set `AI_PROVIDER_MODE=disabled`.

**Commit message:** `feat(ai): add optional ollama provider`

## P4-01 - Response Guard

**Goal:** Prevent unsafe/hallucinated provider and policy responses.

**Impacted files:**

- `ai-service/app/guards/*`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/agents/response_composer.py`
- `ai-service/tests/test_response_guard.py`

**Steps:**

1. Add guard rules for fake balances/statuses/users/request IDs.
2. Require citations for policy answers.
3. Reject unsupported tool names.
4. Redact secrets.
5. Fallback to deterministic response on guard failure.

**What not to do:**

- Do not block backend tool results.
- Do not trust provider self-classification.

**Tests:**

```powershell
python -m pytest tests/test_response_guard.py tests/test_policy_agent.py tests/test_read_tool_response_contract.py -v
```

**Expected output:** Unsafe provider/policy outputs are rejected safely.

**Risk:** False positives.

**Rollback:** Disable guard by config for local only.

**Commit message:** `feat(ai): add response guard`

## P4-02 - Deterministic Fallback

**Goal:** Guarantee safe responses when provider/RAG/guard fails.

**Impacted files:**

- `ai-service/app/providers/router.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/tests/test_deterministic_fallback.py`

**Steps:**

1. Define fallback result reason codes.
2. Add deterministic response path.
3. Add observability for fallback reason.
4. Test timeout, unavailable provider, guard rejection, RAG unavailable.

**What not to do:**

- Do not expose stack traces.
- Do not invent data.

**Tests:**

```powershell
python -m pytest tests/test_deterministic_fallback.py tests/test_chat_v2.py -v
```

**Expected output:** AI remains useful without provider.

**Risk:** Duplicate answer paths.

**Rollback:** Disable provider hook.

**Commit message:** `fix(ai): guarantee deterministic fallback`

## P5-01 - Manager and RH Approval Agent Modernization

**Goal:** Remove legacy dependency for approval/refusal flows and fetch details before confirmation.

**Impacted files:**

- `ai-service/app/agents/manager_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/tools/manager_tools.py`
- `ai-service/app/tools/rh_tools.py`
- `ai-service/app/core/copilot_engine.py`
- tests for approval resolution.

**Steps:**

1. Verify backend approval endpoints for leave, telework, authorization, documents.
2. Implement read/detail tools.
3. Implement decide tools with confirmation.
4. Add ambiguity resolution.
5. Remove legacy approval tool usage for these flows.

**What not to do:**

- Do not approve/refuse without details.
- Do not let RH create employee personal requests by accident.
- Do not bypass backend role checks.

**Tests:**

```powershell
python -m pytest tests/test_approval_resolution.py tests/test_role_action_routing.py tests/test_tool_registry.py -v
```

**Backend compile if changed:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\rh-service
.\mvnw.cmd clean compile -DskipTests
```

**Expected output:** Manager/RH approvals show details and require confirmation.

**Risk:** Endpoint inconsistencies between request domains.

**Rollback:** Keep legacy fallback for unsupported cases only.

**Commit message:** `feat(ai): modernize manager rh approval agents`

## P5-02 - CommunicationAgent First Tools

**Goal:** Activate CommunicationAgent with safe read tools and optional confirmed send.

**Impacted files:**

- `ai-service/app/agents/communication_agent.py`
- `ai-service/app/tools/communication_tools.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/tests/test_communication_agent.py`

**Steps:**

1. Verify communication-service endpoints.
2. Add list channels/read messages tools.
3. Add summarize channel using deterministic summary first.
4. Add send message tool only with confirmation.
5. Enforce membership/tenant through backend.

**What not to do:**

- Do not read private messages across membership boundaries.
- Do not send without confirmation.
- Do not summarize unsupported channels.

**Tests:**

```powershell
python -m pytest tests/test_communication_agent.py tests/test_tool_registry.py -v
```

**Backend compile if changed:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service
.\mvnw.cmd clean compile -DskipTests
```

**Expected output:** CommunicationAgent no longer returns placeholder for supported read prompts.

**Risk:** Communication membership errors if backend data incomplete.

**Rollback:** Disable communication tools and return capability unavailable.

**Commit message:** `feat(ai): add communication copilot tools`

## P6-01 - Redis Communication Event Bus Hardening

**Goal:** Production-harden existing communication Redis fanout and define shared envelope.

**Impacted files:**

- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/config/RedisRealtimeConfig.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/*Redis*`
- communication configs.

**Steps:**

1. Verify Redis disabled by default unless explicitly enabled.
2. Add health/warning behavior.
3. Standardize event envelope.
4. Add fallback when Redis unavailable.

**What not to do:**

- Do not make Redis required for local startup.
- Do not store authority data in Redis.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service
.\mvnw.cmd clean compile -DskipTests
```

**Expected output:** Communication realtime works with or without Redis.

**Risk:** Spring Redis auto-config startup failures.

**Rollback:** Set `communication.redis.enabled=false`.

**Commit message:** `chore(communication): harden redis realtime bus`

## P7-01 - Notifications Integration

**Goal:** Route backend events into user notifications without changing authority workflows.

**Impacted files:**

- organisation notification controllers/services.
- RH/presence event publishers.
- frontend notification service if needed.

**Steps:**

1. Define notification event consumers.
2. Create notifications from backend events.
3. Keep deduplication by eventId.
4. Add frontend display only if API already supports it.

**What not to do:**

- Do not use n8n yet.
- Do not mutate request status from notifications.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\organisation-service
.\mvnw.cmd clean compile -DskipTests

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npx tsc --noEmit -p tsconfig.app.json
```

**Expected output:** Event-driven notifications are safe and deduplicated.

**Risk:** Notification spam.

**Rollback:** Disable consumer flag.

**Commit message:** `feat(notifications): consume backend events safely`

## P8-01 - n8n Webhook Bridge

**Goal:** Add a disabled-by-default bridge for non-critical automation webhooks.

**Impacted files:**

- backend notification/integration module or a small bridge service.
- config files.
- n8n workflow export docs.

**Steps:**

1. Add signed webhook sender.
2. Allow only whitelisted event types.
3. Add retries and dead-letter logging.
4. Keep disabled by default.
5. Add one manual test event endpoint in local/dev only if needed.

**What not to do:**

- Do not expose raw JWTs.
- Do not let n8n approve/reject/mutate HR data.
- Do not write directly to DB.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\organisation-service
.\mvnw.cmd clean compile -DskipTests
```

**Expected output:** Safe bridge contract exists; workflows can be added later.

**Risk:** Webhook secret leakage or unbounded retries.

**Rollback:** Disable webhook bridge config.

**Commit message:** `feat(integrations): add n8n webhook bridge`

## P9-01 - ChromaDB Policy RAG

**Goal:** Replace local keyword-only policy retrieval with optional tenant-scoped ChromaDB while preserving local fallback.

**Impacted files:**

- `ai-service/app/policy/*`
- `ai-service/app/tools/policy_tools.py`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- policy tests.

**Steps:**

1. Add optional ChromaDB config.
2. Add source ingestion for approved policy docs.
3. Store tenant/source/language metadata.
4. Query by tenant only.
5. Require citations for answers.
6. Fallback to local keyword retrieval if Chroma unavailable.

**What not to do:**

- Do not use RAG for live balances/statuses.
- Do not answer without citations.
- Do not cross tenant boundaries.

**Tests:**

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_policy_retriever.py tests/test_policy_agent.py -v
```

**Expected output:** PolicyAgent supports vector retrieval with safe fallback.

**Risk:** Dependency install/runtime issues.

**Rollback:** Set RAG provider to local keyword fallback.

**Commit message:** `feat(ai): add chromadb policy rag`

## P10-01 - LangGraph Readiness Adapter

**Goal:** Prepare graph-compatible boundaries without introducing LangGraph runtime.

**Impacted files:**

- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/agents/base_domain_agent.py`
- planning/report docs.

**Steps:**

1. Define future graph nodes: context, route, plan, tool, guard, compose.
2. Keep current copilot engine runtime.
3. Ensure ToolRegistry remains the only authority for tools.
4. Add docs and minimal interface tests if code is touched.

**What not to do:**

- Do not install LangGraph.
- Do not rewrite runtime orchestration.
- Do not let graph call backend directly.

**Tests:**

```powershell
python -m pytest tests/test_chat_v2.py tests/test_tool_registry.py -v
```

**Expected output:** Clear future migration seam with no behavior change.

**Risk:** Premature abstraction.

**Rollback:** Keep documentation only.

**Commit message:** `docs(ai): prepare langgraph boundaries`

## P11-01 - Final Regression and Production Readiness

**Goal:** Validate complete AI/backend/frontend integration after the hybrid foundation tasks.

**Impacted files:**

- New final regression report.
- Small fixes only if tests reveal regressions.

**Steps:**

1. Run AI import and full tests.
2. Run frontend build and TypeScript check.
3. Compile gateway and changed services.
4. Run browser validation for chat, voice, pointage, leave, documents, manager/RH/admin prompts, communication websocket.
5. Verify Braintrust optional behavior.
6. Verify no raw JWT/API keys in logs.

**What not to do:**

- Do not hide failing tests.
- Do not make broad refactors.
- Do not commit unrelated dirty files.

**Tests:**

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

**Expected output:** Production readiness report with pass/fail matrix and remaining limitations.

**Risk:** Environment-specific failures such as disk space or local service ports.

**Rollback:** No rollback for report; revert only small fixes if introduced.

**Commit message:** `test(ai): add hybrid readiness regression report`

## Recommended First Implementation Batch

1. `P0-01` - Baseline/config drift report.
2. `P1-01` - Gateway/security stabilization.
3. `P2-01` - JWT verification hardening.
4. `P2-02` - ToolRegistry authority audit.
5. `P4-01` - Response Guard.

Only after those are stable should `P3-01` and `P3-02` introduce provider/Ollama behavior.
