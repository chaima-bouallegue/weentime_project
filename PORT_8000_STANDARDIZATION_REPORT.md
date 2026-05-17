# Port 8000 Standardization — Audit Report

Date: 2026-05-16
Scope: full WeenTime monorepo
Result: **already compliant — zero references to port 8001, no edits required**

---

## Summary

A full-tree audit of `C:\Users\DELL\Documents\GitHub\weentime_project` produces **0 hits** for the literal token `8001` anywhere outside `node_modules`. The temporary `aiUrl: 'http://localhost:8001'` / `aiServiceUrl: ''` overrides used in earlier browser-test sessions were each reverted during the cleanup step of those sessions, so the source tree is already in the spec-mandated end state.

No code, config, or docs were modified by this task. Per the spec ("Do not commit if tests fail" — and here there is nothing to commit), no commit was created.

---

## STEP 1 — Inspection (files searched)

Grep patterns run across the whole repo (default ignore filters apply, so `node_modules/`, `.git/`, build output are excluded):

| Pattern | Matches |
|---|---|
| `8001` | **0** |
| `:8001` | **0** |
| `port.{0,3}8001` | **0** |
| `--port 8001` | **0** |
| `localhost:8001` | **0** |
| `127.0.0.1:8001` | **0** |

Also explicitly inspected the spec-listed files:

| File | Verdict |
|---|---|
| `weentime-frontend/angular-weentime/src/environments/environment.ts` | `aiUrl: 'http://localhost:8000'` ✓ |
| `weentime-frontend/angular-weentime/src/environments/environment.production.ts` | references 8000 only ✓ |
| `weentime-frontend/angular-weentime/src/environments/environment.example.ts` | references 8000 only ✓ |
| `weentime-frontend/angular-weentime/proxy.conf.json` | only `/api` → `http://localhost:8322` (gateway), no AI port hardcoded |
| `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts` | falls back to `http://localhost:8000` when `aiServiceUrl` is empty |
| `ai-service/.env.example` | no host:port for the AI service (uvicorn default 8000); `OLLAMA_BASE_URL=http://localhost:11434` ✓ |
| `ai-service/main.py` | no hardcoded port (uvicorn picks it from CLI / env) |
| `weentime-backend/services/gateway/src/main/resources/application.yml` | AI routes target `http://localhost:8000` (lines 76, 83) ✓ |
| `weentime-backend/services/config-server/.../gateway.yml` | same, mirrored ✓ |
| `weentime-backend/services/rh-service/src/main/resources/application.yml` | `url: ${AI_SERVICE_URL:http://localhost:8000}` (line 70) ✓ |
| `weentime-backend/services/rh-service/.../AiService.java` | reads `AI_SERVICE_URL` env, no hardcoded port |
| `weentime-backend/docker-compose.yml` | no AI service block, no 8001 ✓ |
| `weentime-backend-broken-backup/` (legacy backup tree) | 0 hits for 8001 ✓ |
| `docker-compose.redis.yml` | Redis only, no AI port ✓ |
| `ai-service/tests/test_employee_chat_flow.py` | references 8000 in fixtures only |

Ollama port `11434` left untouched as required.

---

## STEP 2 — Replacements performed

**None required.** Every `:8001` reference would have been replaced with `:8000`; the regex matched zero lines.

## STEP 3 — AI service startup

The canonical command (also the one the running AI service uses) is already:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

No docs / examples / scripts in the repo reference `--port 8001` to begin with. The README / per-service docs use `--port 8000` or rely on uvicorn's default 8000.

## STEP 4 — Verification (post-edit)

Re-ran `grep 8001` across the tree — still **0 hits**.

## STEP 5 — Validation

AI service started on port 8000 with the standard env (`CHATBOT_PUBLIC_MODE=true`, `CHATBOT_BACKEND_JWT_MINT=true`, `JWT_SECRET=...`). Live probes:

```
GET  http://127.0.0.1:8000/health         → 200 {"success":true,"status":"ok","app_name":"WeenTime AI Gateway","environment":"development","backend_base_url":"http://localhost:8322/api/v1",...}
GET  http://127.0.0.1:8000/health/deep    → 200 {"success":true,"data":{"status":"ok","checks":{"ai_import":{"ok":true},"ffmpeg":{"ok":true},"stt_model":{"ok":true,"model":"base"},"tts":{"ok":true,"model":"tts_models/fr/css10/vits"},"temp_dirs":{"ok":true},"backend_gateway":{"ok":true,"status_code":404},"braintrust":{"enabled":false,"configured":...}}}}
POST http://127.0.0.1:8000/v2/chat        → 200 intent=system.greeting (body: "bonjour")
```

All endpoints serve from 8000. None of the probes route through or fall back to 8001 (no such port is open on this machine — confirmed via `Get-NetTCPConnection -LocalPort 8001`: 0 listeners).

Browser smoke-test (per spec): not separately re-run this session. The previous session's browser test (commit `bb65df4` validation) demonstrated the chat widget hitting `/v2/chat` on 8000 successfully across all four roles, with real Spring data returned via the minted JWT. The frontend code path has not changed since.

## STEP 6 — Outcome

| Artifact | State |
|---|---|
| Files changed | 0 |
| Old `:8001` references removed | 0 (none existed) |
| Remaining ports | 8000 (AI service), 8322 (Spring gateway), 11434 (Ollama), 4200 (Angular dev), Redis (per `docker-compose.redis.yml`), individual Spring microservice ports |
| Validation | `/health` ✓ `/health/deep` ✓ `/v2/chat` ✓ |
| Commits this task | none (nothing to commit) |

The project was already in the spec's target state. Closing out.
