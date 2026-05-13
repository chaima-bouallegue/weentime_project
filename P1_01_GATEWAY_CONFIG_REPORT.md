# P1-01 Gateway Config Report

Date: 2026-05-13
Project root: `C:\Users\DELL\Documents\GitHub\weentime_project`
Task: P1-01 - Gateway and config stabilization with clean commit

## Summary

Local development URLs were aligned around the P0-01 standard:

| Component | Final local value |
| --- | --- |
| Gateway | `http://localhost:8322` |
| Gateway API base | `http://localhost:8322/api/v1` |
| AI service | `http://localhost:8000` |
| AI service via gateway | `http://localhost:8322/api/v1/ai` |
| Auth service | `http://localhost:8181` |
| Organisation service | `http://localhost:8190` |
| RH service | `http://localhost:8192` |
| Presence service | `http://localhost:8193` |
| Communication service | `http://localhost:8194` |
| Config server | `http://localhost:8988` |

No Ollama, Redis, n8n, agents, or business logic features were added.

## Files Changed

- `ai-service/config.py`
- `ai-service/app/tools/backend_client.py`
- `ai-service/tools/api_client.py`
- `weentime-frontend/angular-weentime/src/environments/environment.ts` (local ignored file; updated but not staged)
- `weentime-frontend/angular-weentime/src/environments/environment.example.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.production.ts`
- `weentime-frontend/angular-weentime/proxy.conf.json`
- `weentime-backend/services/gateway/src/main/resources/application.yml`
- `weentime-backend/services/config-server/config-repo/gateway.yml`
- `weentime-backend/services/config-server/src/main/resources/configurations/gateway.yml`
- `P1_01_GATEWAY_CONFIG_REPORT.md`

## Frontend URL Changes

- `environment.apiUrl` now targets `http://localhost:8322/api/v1`.
- `environment.gatewayUrl` and `environment.wsUrl` now target `http://localhost:8322`.
- WebSocket URLs now use gateway port `8322`.
- `environment.aiServiceUrl` now targets `http://localhost:8322/api/v1/ai`, so normal chat and voice calls go through the gateway.
- `environment.aiUrl` remains `http://localhost:8000` only as a documented local debugging fallback.
- `environment.example.ts` no longer contains a frontend LLM key placeholder. It now explicitly says not to store LLM/API provider keys in Angular.
- Angular dev proxy target was updated from `http://localhost:8222` to `http://localhost:8322`.

## AI Backend URL Changes

- `config.py` default `BACKEND_BASE_URL` changed from `http://localhost:8222/api` to `http://localhost:8322/api/v1`.
- Modern `BackendClient` default changed from `http://localhost:8222/api/v1` to `http://localhost:8322/api/v1`.
- Legacy `ApiClient` now normalizes `/v1/...` and `/api/v1/...` endpoint inputs when the base URL already ends in `/api/v1`. This preserves existing legacy `/chat` tool calls after the base URL moved to `/api/v1`.

## Gateway Route Changes

Added AI proxy routes in both gateway config locations:

```yaml
- id: ai-service-api
  uri: http://localhost:8000
  predicates:
    - Path=/api/v1/ai/**
  filters:
    - StripPrefix=3

- id: ai-service-audio-stream
  uri: http://localhost:8000
  predicates:
    - Path=/audio-stream, /audio-stream/**
```

The `StripPrefix=3` filter maps:

- `/api/v1/ai/v2/chat` -> `/v2/chat`
- `/api/v1/ai/v2/voice` -> `/v2/voice`
- `/api/v1/ai/audio-stream` -> `/audio-stream`

CORS allowed headers now include `X-Request-ID` in gateway local configs.

## Config Server Gateway Changes

- `config-repo/gateway.yml` now defaults gateway port to `8322`.
- Config-server gateway routes now default to local service URLs on `8181`, `8190`, `8192`, `8193`, and `8194` instead of mixed load-balanced/old-port defaults.
- Communication and AI routes were added to `config-repo/gateway.yml`.
- `src/main/resources/configurations/gateway.yml` now uses port `8322` and config import `http://localhost:8988`.

## Run Script

`run-all-services.ps1` already contained the selected local service ports before this task. It was not modified in this task and is not staged by this commit to avoid mixing pre-existing dirty work with P1-01 changes.

`weentime-frontend/angular-weentime/src/environments/environment.ts` is ignored by the Angular project `.gitignore`. It was updated locally for validation, while tracked environment templates carry the source-controlled URL changes.

## Validation Results

### Gateway compile

Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd clean compile -DskipTests
```

Result: passed.

### AI import

Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
```

Result: passed, output `ok`.

### Frontend TypeScript

Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npx tsc --noEmit -p tsconfig.app.json
```

Result: passed.

## Remaining Risks

- Some documentation and tests still mention old `8222` values as historical fixtures; they were not changed because this task was scoped to runtime/local config.
- `weentime-backend-broken-backup` still contains old backup configs; it was intentionally not touched.
- `run-all-services.ps1` remains dirty from pre-existing port changes and should be reviewed separately if the team wants it included in a later cleanup commit.
- `weentime-frontend/angular-weentime/src/environments/environment.ts` is a local ignored file, so it is not staged in this commit.
- Direct AI URL `http://localhost:8000` remains in frontend env files only as a documented local debugging fallback; runtime services prefer `aiServiceUrl` through the gateway.

## Exact Files Staged

Planned staged files for the P1-01 commit:

```text
ai-service/config.py
ai-service/app/tools/backend_client.py
ai-service/tools/api_client.py
weentime-frontend/angular-weentime/src/environments/environment.example.ts
weentime-frontend/angular-weentime/src/environments/environment.production.ts
weentime-frontend/angular-weentime/proxy.conf.json
weentime-backend/services/gateway/src/main/resources/application.yml
weentime-backend/services/config-server/config-repo/gateway.yml
weentime-backend/services/config-server/src/main/resources/configurations/gateway.yml
P1_01_GATEWAY_CONFIG_REPORT.md
```

## Commit

Commit message:

```text
fix(config): align local gateway urls
```

Commit hash: recorded in the final task output after the commit is created.
