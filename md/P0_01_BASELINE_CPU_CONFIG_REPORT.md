# P0-01 Baseline CPU Config Report

Date: 2026-05-13
Project root: `C:\Users\DELL\Documents\GitHub\weentime_project`
Task: Repository baseline and CPU-only AI readiness

## Executive Summary

This is a documentation-only baseline before implementation. No feature code was changed, no git reset was run, no commit was made, and no unrelated files were deleted.

The repository is not yet aligned on one local gateway standard. The checked-in gateway application file uses port `8322` and routes to backend services on `819x`, while the Angular environment and AI service defaults still point to `8222`. Config-server files also contain mixed `8222`, `809x`, `819x`, `8888`, and `8988` values. This drift should be fixed before adding Ollama or any LLM provider.

CPU-only AI strategy should start with `qwen2.5:3b` through optional Ollama, disabled by default. `qwen2.5:7b` should wait until latency is measured on the target laptop. GPU must not be required.

## Git Status Baseline

`git status -sb` before this report showed existing dirty files unrelated to this task:

```text
## main...origin/main
 M run-all-services.ps1
 M weentime-backend/services/communication-service/src/main/resources/application.yml
 M weentime-backend/services/config-server/config-repo/organisation-service.yml
 M weentime-backend/services/config-server/config-repo/presence-service.yml
 M weentime-backend/services/config-server/config-repo/rh-service.yml
 M weentime-backend/services/config-server/src/main/resources/configurations/communication-service.yml
 M weentime-backend/services/config-server/src/main/resources/configurations/organisation-service.yml
 M weentime-backend/services/config-server/src/main/resources/configurations/presence-service.yml
 M weentime-backend/services/config-server/src/main/resources/configurations/rh-service.yml
 M weentime-backend/services/organisation-service/src/main/resources/application.yml
 M weentime-backend/services/presence-service/src/main/resources/application.yml
 M weentime-backend/services/rh-service/src/main/resources/application.yml
 ?? AI_HYBRID_TASKS.md
 ?? AI_SERVICE_AGENT_AUDIT.md
 ?? IMPLEMENTATION_BACKLOG.md
 ?? PLAN.md
 ?? REDIS_N8N_PLAN.md
```

This report adds one new file: `P0_01_BASELINE_CPU_CONFIG_REPORT.md`.

## Current Backend Gateway Ports and Routes

### Gateway application file

Source: `weentime-backend/services/gateway/src/main/resources/application.yml`

Observed local gateway:

| Component | Current value |
| --- | --- |
| Gateway port | `8322` |
| Config server import | `optional:configserver:http://localhost:8988` |
| Auth service route | `http://localhost:8181`, path `/api/v1/auth/**` |
| Organisation service route | `http://localhost:8190`, paths `/api/v1/admin/**`, `/api/v1/organisations/**`, `/api/v1/users/**`, `/api/v1/notifications/**`, `/api/v1/structure/**` |
| RH service route | `http://localhost:8192`, paths `/api/v1/rh/**`, `/api/v1/demandes/**`, `/api/v1/conges/**`, `/api/v1/solde-conges/**`, `/api/v1/documents/**`, `/api/v1/absences/**`, `/api/v1/autorisations/**`, `/api/v1/manager/**`, `/api/v1/leave-balances/**`, `/api/v1/teletravail/**` |
| Presence service route | `http://localhost:8193`, paths `/api/v1/presence/**`, `/api/v1/presences/**`, `/api/presence/**`, `/api/v1/horaires/**` |
| Communication service route | `http://localhost:8194`, path `/api/v1/communication/**` |
| Organisation websocket route | `http://localhost:8190`, paths `/ws/**`, `/ws-org/**` |
| RH websocket route | `http://localhost:8192`, path `/ws-rh/**` |
| Presence websocket route | `http://localhost:8193`, path `/ws-presence/**` |
| Communication websocket route | `http://localhost:8194`, paths `/ws-communication`, `/ws-communication/**` |

### Config-server repo files

Observed drift:

| File | Observed value | Drift |
| --- | --- | --- |
| `config-server/config-repo/gateway.yml` | `port: ${SERVER_PORT:8222}` | differs from gateway app `8322` |
| `config-server/src/main/resources/configurations/gateway.yml` | `port: 8222` | differs from gateway app `8322` |
| `config-server/src/main/resources/configurations/gateway.yml` | service URIs `8181`, `8190`, `8192`, `8193`, `8194` | aligned with gateway app service ports |
| `config-server/config-repo/organisation-service.yml` | `port: ${SERVER_PORT:8090}` | differs from local `8190` in gateway app/configurations |
| `config-server/config-repo/presence-service.yml` | `port: ${SERVER_PORT:8093}` | differs from local `8193` in gateway app/configurations |
| `config-server/config-repo/rh-service.yml` | `port: ${SERVER_PORT:8192}` | aligned with local `8192` |
| config imports | both `8888` and `8988` appear | config-server port drift |
| config-repo service references | mixed `8092`, `8093`, `8190`, `8192` | internal service URL drift |

## Frontend API URL Baseline

Sources:

- `weentime-frontend/angular-weentime/src/environments/environment.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.production.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.example.ts`
- `weentime-frontend/angular-weentime/src/app/core/services/api-config.service.ts`

Observed frontend values:

| Setting | Current value |
| --- | --- |
| `environment.apiUrl` | `http://localhost:8222/api/v1` |
| `environment.gatewayUrl` | `http://localhost:8222` |
| `environment.aiUrl` | `http://localhost:8000` |
| `environment.aiServiceUrl` | `http://localhost:8000` |
| `environment.wsUrl` | `http://localhost:8222` |
| Websocket URLs | `http://localhost:8222/ws-*` |
| example env | `apiUrl: http://localhost:8222`, includes placeholder `anthropicApiKey` |

Frontend is currently aligned with old `8222`, not the checked gateway application `8322`.

Important note: the placeholder `anthropicApiKey` in `environment.example.ts` is not an active AI provider implementation, but should be removed or replaced with neutral documentation later to avoid suggesting a frontend-held LLM key pattern.

## AI Service Config Baseline

Sources:

- `ai-service/config.py`
- `ai-service/app/tools/backend_client.py`
- `ai-service/requirements.txt`

Observed AI service values:

| Setting | Current value |
| --- | --- |
| AI service port | `8000` default |
| `BACKEND_BASE_URL` in `config.py` | `http://localhost:8222/api` default |
| `BackendClient` default | `http://localhost:8222/api/v1` |
| STT model | `STT_MODEL=base` default |
| STT language | `STT_LANGUAGE=fr` default |
| STT device | `STT_DEVICE=cpu` default |
| TTS enabled | true by default |
| TTS model | `tts_models/fr/css10/vits` |
| TTS GPU | false by default |
| Braintrust | disabled by default, optional env key |
| RAG | local keyword/file retrieval, no ChromaDB dependency |

## Ollama and LLM Config Baseline

Repository search found no active config or dependency for:

- Ollama
- `qwen2.5`
- OpenAI backend provider
- LangGraph
- ChromaDB
- AI provider router
- LLM provider interface

The only frontend LLM-related item found is the placeholder `anthropicApiKey` in `environment.example.ts`. It is not a safe production pattern and should not be used. LLM keys must never live in Angular frontend code.

Current AI service is deterministic agent/tool based. It does not currently use a chat LLM for core copilot behavior.

## CPU-only AI Decision

### Decision

Use CPU-only local AI first:

1. First model: `qwen2.5:3b`
2. Optional later: `qwen2.5:7b` only if latency is acceptable
3. No GPU requirement
4. Ollama optional and disabled by default
5. Deterministic fallback mandatory
6. LLM cannot execute HR actions directly

### Rationale

`qwen2.5:3b` is the safer first local model for a laptop CPU because it reduces RAM pressure and latency risk. The product already has deterministic ToolRegistry-based execution, so the LLM should initially improve language quality, summarization, clarification, and response drafting, not action execution.

### Proposed future config

Do not implement in P0-01. For the next AI provider task, use config like:

```env
AI_PROVIDER_MODE=disabled
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_FALLBACK_MODEL=
OLLAMA_TIMEOUT_SECONDS=20
OLLAMA_MAX_TOKENS=512
OLLAMA_TEMPERATURE=0.2
```

Only after measured local latency is acceptable:

```env
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_FALLBACK_MODEL=qwen2.5:3b
```

## Recommended Standard Local URL

### Recommendation

Standardize local development on the gateway values already used by the checked gateway application and service configuration files:

| Component | Recommended local URL |
| --- | --- |
| Gateway | `http://localhost:8322` |
| Gateway API base | `http://localhost:8322/api/v1` |
| AI service | `http://localhost:8000` |
| Auth service | `http://localhost:8181` |
| Organisation service | `http://localhost:8190` |
| RH service | `http://localhost:8192` |
| Presence service | `http://localhost:8193` |
| Communication service | `http://localhost:8194` |
| Config server | `http://localhost:8988` if preserving current gateway import |
| Discovery service | `http://localhost:8761` |

### Why `8322` instead of `8222`

The active gateway application file uses `8322`, and its routes point to `819x` services. Several local app/configuration files also already use `819x`. The frontend and AI defaults are the main parts still pointing at `8222`. Changing those later is smaller and safer than moving the gateway and config-server back to the older `8222/809x` profile.

### Required follow-up

A later implementation task must update:

- Angular `environment.ts`
- Angular `environment.production.ts` only if it is used for local deployment, otherwise production should use deploy-time env replacement
- AI `BACKEND_BASE_URL` default or `.env` documentation
- Config-server `gateway.yml` drift
- `run-all-services.ps1`

## Config Drift Summary

| Area | Current state | Risk | Recommendation |
| --- | --- | --- | --- |
| Gateway app | `8322` | conflicts with frontend/AI | keep as standard or change all together |
| Frontend env | `8222` | browser calls wrong gateway | update to standard local gateway |
| AI config | `8222/api` and BackendClient `8222/api/v1` | tools call wrong gateway | update env/default to standard gateway |
| Config-server repo | mixed `8222`, `809x`, `819x`, `8888`, `8988` | services may start with different ports depending config source | normalize profiles |
| Ollama config | absent | future provider work has no safe switch | add disabled-by-default provider config later |
| LLM frontend key placeholder | `anthropicApiKey` in example | encourages unsafe frontend secret pattern | remove/replace later |

## Tests Status

### Executed in this task

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
```

Result:

```text
ok
```

### Not executed in this task

Full tests/builds were not run because P0-01 validation requested only AI import check. These should be run in the next implementation or stabilization task:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests -v

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npm run build
npx tsc --noEmit -p tsconfig.app.json

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests
```

## Exact Next Tasks

### P1-01 - Local URL and gateway profile normalization

Goal: align frontend, AI service, gateway, config-server, and run script around one local URL set.

Scope:

- Update local/dev env values to `http://localhost:8322/api/v1` and websocket base `http://localhost:8322` if `8322` remains the chosen standard.
- Update AI `BACKEND_BASE_URL` docs/default/profile to `http://localhost:8322/api/v1`.
- Normalize config-server gateway/service port drift.
- Update `run-all-services.ps1` only if it currently starts old ports.

Validation:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npx tsc --noEmit -p tsconfig.app.json

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests
```

Commit message when green:

```text
fix(config): align local gateway urls
```

### P2-01 - JWT verification and canonical context hardening

Goal: make AI context production-safe before adding provider behavior.

Scope:

- Verify JWT signatures or validate through backend.
- Treat backend `/users/me` role/tenant as canonical when reachable.
- Reject mismatched payload `user_id`.
- Preserve test fixture mode only for tests/dev.

Validation:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_context_builder.py tests/test_chat_v2.py -v
```

Commit message when green:

```text
fix(ai): harden jwt context verification
```

### P3-01 - Provider interface with disabled default

Goal: add the provider abstraction without introducing Ollama runtime behavior yet.

Scope:

- Add provider interface and disabled provider.
- Add provider router.
- Add health status.
- Do not call provider from business actions.

Validation:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_chat_v2.py tests/test_tool_registry.py -v
```

Commit message when green:

```text
feat(ai): add provider router foundation
```

### P3-02 - Optional Ollama CPU provider

Goal: add optional Ollama support using `qwen2.5:3b` first.

Scope:

- Default `AI_PROVIDER_MODE=disabled`.
- Add `OLLAMA_MODEL=qwen2.5:3b` as recommended local model.
- Add timeouts and deterministic fallback.
- Keep all HR actions behind ToolRegistry.

Validation:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_chat_v2.py tests/test_tool_registry.py -v
```

Commit message when green:

```text
feat(ai): add optional cpu ollama provider
```

### P4-01 - Response Guard before provider usage

Goal: prevent hallucinated HR values before using provider responses in chat.

Scope:

- Block fake leave balances, statuses, request IDs, users, unsupported tools, and policy answers without citations.
- Fallback to deterministic response on guard failure.

Validation:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -m pytest tests/test_policy_agent.py tests/test_read_tool_response_contract.py -v
```

Commit message when green:

```text
feat(ai): add response guard foundation
```

## Risks

| Risk | Severity | Notes | Mitigation |
| --- | --- | --- | --- |
| Gateway URL drift | High | frontend/AI on `8222`, gateway app on `8322` | normalize P1-01 before provider work |
| Config-server profile drift | High | mixed `809x`, `819x`, `8888`, `8988` | choose one local standard and update configs together |
| Ollama introduced before guard | High | model may hallucinate HR values | implement Response Guard before provider answers affect UI |
| `qwen2.5:7b` too slow on CPU | Medium | likely latency/RAM pressure | start with `qwen2.5:3b`; benchmark before 7b |
| Frontend example LLM key pattern | Medium | suggests unsafe client-side secrets | remove placeholder in later config cleanup |
| Full tests unknown | Medium | only import check run in P0 | run full suite in P1/P2 |
| Dirty worktree | Medium | existing unrelated changes could be accidentally committed | use targeted staging only in future tasks |

## Validation Commands To Keep

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

Service-specific backend validation when files are changed:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\organisation-service
.\mvnw.cmd clean compile -DskipTests

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\rh-service
.\mvnw.cmd clean compile -DskipTests

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\presence-service
.\mvnw.cmd clean compile -DskipTests

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service
.\mvnw.cmd clean compile -DskipTests
```

## Stop Condition

P0-01 stops after this report. No feature implementation was performed. No commit was made.
