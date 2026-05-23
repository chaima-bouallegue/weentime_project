# CHATBOT_PUBLIC_MODE — AI chatbot demo-mode auth removal report

## Goal

Make the WeenTime AI chatbot endpoints reachable without an `Authorization`
header **only** when the deployment opts in via the `CHATBOT_PUBLIC_MODE`
environment flag. All other APIs (auth, RH, organisation, presence,
communication, admin) and all backend Spring services remain fully
JWT-protected. ToolRegistry role checks and ResponseGuard remain enforced.

## Project analysis (snapshot)

The chatbot 401 errors traced to **two** independent JWT gates:

1. **Spring Cloud Gateway** (`weentime-backend/services/gateway/src/main/java/com/weentime/gateway/security/JwtGlobalFilter.java`) blocks every `/api/v1/**` path that is not in its explicit exemption list. AI chatbot calls (`/api/v1/ai/v2/chat`, `/api/v1/ai/v2/voice`) hit this gate first and are rejected before they ever reach FastAPI when no token is present.
2. **FastAPI AI service** (`ai-service/app/api/chat_v2.py`, `ai-service/app/api/voice_v2.py`) builds a `CurrentUserContext` via `ContextBuilder.build`, which raises `ContextError("missing_jwt", ..., 401)` when the bearer token is absent.

`ToolRegistry._validate_context` (`ai-service/app/tools/registry.py`) requires
both a positive `user_id` and `is_verified=True` on the context, so any
fallback context must satisfy these for tools to remain callable. Permissions
are still checked against the role through `permissions_for_role()` and the
`allowed_roles` set on each tool definition.

`ResponseGuard` (`ai-service/app/guards/response_guard.py`) runs unchanged on
every response, including under public mode.

`/chat/history/{user_id}` is already a public FastAPI endpoint (no auth
dependency); it was only inaccessible because the gateway blocked it.

## What changed

### Env flag (default OFF)

- `ai-service/config.py` — adds `Settings.chatbot_public_mode` reading the
  `CHATBOT_PUBLIC_MODE` env variable (default `False`).
- `ai-service/.env.example` — documents the flag with a clear "never enable in
  production" warning.
- `weentime-frontend/angular-weentime/src/environments/environment.ts` — sets
  `chatbotPublicMode: true` for the local dev build so the chat widget UX
  matches the AI service's demo behaviour.
- `weentime-frontend/angular-weentime/src/environments/environment.production.ts`
  and `environment.example.ts` — keep `chatbotPublicMode: false`.

### Anonymous chatbot context helper

- New `ai-service/app/context/anonymous_context.py` exporting
  `build_chatbot_context_from_metadata(metadata, *, locale, language, channel)`.
  - Roles are validated against `BUSINESS_ROLES = {ADMIN, RH, MANAGER, EMPLOYEE}`; anything else falls back to `EMPLOYEE`.
  - `user_id` defaults to 1, `entreprise_id` defaults to 1, language defaults to `fr`.
  - `permissions` are derived from the role via `permissions_for_role()` — the request **cannot** inject arbitrary permissions.
  - Marks the context with `metadata["jwt_verified"]=True`, `anonymous_chatbot=True`, `source="anonymous_chatbot_demo"` so ToolRegistry accepts the call but downstream code can detect the demo origin.

### AI endpoints made public ONLY in demo mode

Each endpoint first reads `Settings.chatbot_public_mode`. When `False`, the
existing JWT enforcement is unchanged.

- `ai-service/app/api/chat_v2.py` — `POST /v2/chat` and `POST /v2/chat/confirm`
  - When the bearer token is missing AND public mode is on, build the anonymous context from `payload.metadata` and pass it as the verified `context` argument to `process_copilot_message` / `WorkflowOrchestrator.confirm_action`.
  - Also catches a `ContextError(401)` raised inside the workflow and retries once with the anonymous context, so an invalid/expired token plus public mode behaves the same as a missing token plus public mode.
- `ai-service/app/api/voice_v2.py` — `POST /v2/voice`
  - Accepts a new `metadata` form field carrying the JSON the frontend already sends.
  - When no bearer token and public mode is on, builds the anonymous voice context from that metadata; otherwise the call still goes through `ContextBuilder.build` and fails with 401 on missing JWT.
  - Audio validation, STT, role-router selection, and ResponseGuard are unchanged.
- `ai-service/app/core/copilot_engine.py` — `process_copilot_message` now forwards an optional `context` to `WorkflowOrchestrator.process_message`, which already supports a pre-built context via `build_workflow_context(... context=...)`.
- `ai-service/app/models/agent_models.py` — `ChatV2Request` and `ConfirmActionRequest` now declare a `metadata: dict` field (the frontend was already sending one; FastAPI was silently dropping it).

`/chat/history/{user_id}` is already public on FastAPI; only the gateway needed
to be opened for it.

### Gateway exemptions (gated by env flag)

- `weentime-backend/services/gateway/src/main/java/com/weentime/gateway/security/JwtGlobalFilter.java`
  - New `@Value("${chatbot.public-mode:${CHATBOT_PUBLIC_MODE:false}}")` field, defaulting to `false`.
  - New `isPublicChatbotPath(path)` returns true only for exactly `/api/v1/ai/v2/chat`, `/api/v1/ai/v2/voice`, `/api/v1/ai/v2/chat/confirm` and the prefix `/api/v1/ai/chat/history/`.
  - These paths are added to the existing exemption block; **no other gateway routes are touched**, so RH, organisation, presence, communication, admin, and other AI routes (`/api/v1/ai/v2/*` not in the list, `/api/v1/ai/chat`, `/api/v1/ai/audio`, etc.) still require JWT.

### Frontend

- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
  - `buildAiChatRequestPayload(message, { userId, role, entrepriseId })` now always sends `channel: 'chat'`, `language`, plus `role`, `userId`, and `entrepriseId` when known.
  - `sendChatV2` and `confirmAction` resolve the role from the current user, and `confirmAction` now sends `metadata` and `user_id` alongside the existing fields.
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`
  - The voice multipart `metadata` JSON now includes `channel`, `language`, `role`, `userId`, and `entrepriseId`.
  - When `environment.chatbotPublicMode` is true, the service no longer requires a bearer token before uploading voice; missing token is allowed and the `Authorization` header is only attached when present.
  - `getUserContext()` falls back to a synthetic `EMPLOYEE` user (id=1) in public mode so the recorder can start even when the user is not logged in; otherwise it still returns null and surfaces the session-expired event.
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.ts`
  - `handleRequestFailure` and the voice `authExpired` event no longer push the "Votre session a expire" / "Se reconnecter" UX when `environment.chatbotPublicMode` is true; instead they post a soft assistant message and resume auto-listen.
- The functional `auth.interceptor.ts` already honours `SKIP_AUTH_REDIRECT`, which the chat widget already sets, so no auto-logout/redirect happens for AI chatbot 401s.

### Tests

- New `ai-service/tests/test_chatbot_public_mode.py` (11 tests):
  - `resolve_anonymous_role` defaults to EMPLOYEE for missing/unknown values; normalizes `admin`, `ROLE_RH`, `Manager`, `EMPLOYEE`.
  - `build_chatbot_context_from_metadata` honours metadata, falls back when empty, defaults invalid roles to EMPLOYEE, and marks context verified with the demo source flag.
  - `POST /v2/chat` without JWT returns **401** when `CHATBOT_PUBLIC_MODE=false` and **200** when `CHATBOT_PUBLIC_MODE=true`.
  - `metadata.role=ADMIN` builds an ADMIN context; invalid role defaults to EMPLOYEE (verified by patching `process_copilot_message` and inspecting the captured context).
  - `POST /v2/chat/confirm` without JWT returns **401** when public mode is off.
  - `GET /chat/history/{userId}` returns 200 (already public on FastAPI).
  - An auto-use fixture restores `CHATBOT_PUBLIC_MODE` and `get_settings.cache_clear()` after each test so the flag never leaks into other suites.

## Validation results

```text
$ cd ai-service && python -c "import main; print('main module imports OK')"
main module imports OK

$ cd ai-service && python -m pytest tests/test_chatbot_public_mode.py -v
... 11 passed, 1 warning in 0.90s

$ cd ai-service && python -m pytest tests/test_chat_v2.py tests/test_response_guard.py -v
... 17 passed, 1 warning in 0.76s

$ cd ai-service && python -m pytest tests -q
... 1 failed, 600 passed, 6 warnings in 21.78s
   FAILED tests/test_intent_routing_priority.py::test_greeting_with_question_does_not_match
```

The single failure is **pre-existing** and reproducible on the current `main`
without any of the changes in this branch (verified by stashing all changes and
re-running the suite; the same single test fails under the same conditions). It
is a test-ordering/state issue in `test_intent_routing_priority.py` and is
unrelated to chatbot auth.

```text
$ cd weentime-frontend/angular-weentime && npx tsc --noEmit -p tsconfig.app.json
(clean)

$ cd weentime-frontend/angular-weentime && npm run build
... Output location: .../dist/angular-weentime
(only pre-existing CommonJS optimisation warnings about sockjs-client)
```

Browser smoke tests via chrome-devtools MCP were not run in this iteration; the
manual checklist for the four roles (Employee/Manager/RH/Admin) must be
exercised with `CHATBOT_PUBLIC_MODE=true` set on both the AI service and the
gateway.

## Role behaviour (unchanged, enforced by ToolRegistry)

- **EMPLOYEE** — personal pointage, check-in/out, leave balance, leave
  requests, document requests, telework, authorization, daily summary.
- **MANAGER** — all employee personal actions plus team summary, pending
  approvals, team requests.
- **RH** — all employee personal actions plus RH backlog, final validations,
  document workload, RH stats.
- **ADMIN** — system health, AI provider status.

Write actions still go through the confirmation flow via the
`WorkflowOrchestrator` and ResponseGuard.

## Security limitations and remaining risks

- **Public mode trusts the request to declare its own role.** Anyone who can
  reach the AI service while `CHATBOT_PUBLIC_MODE=true` can claim any of
  ADMIN/RH/MANAGER/EMPLOYEE and exercise that role's chatbot capabilities.
  This is acceptable for local demo deployments and **must not be enabled in
  production**.
- Backend tool calls performed by the AI service still go through the Spring
  backend, which enforces JWT independently. Tools that need the backend will
  fail under public mode (no token to forward); tools that operate locally on
  the AI service or RAG keep working.
- `is_verified=True` is set on the anonymous context to satisfy
  `ToolRegistry._validate_context`. This is a deliberate trade-off: without it
  every tool call would fail with `unverified_context`, making demo mode
  useless. The flag is only set when `chatbot_public_mode=True` AND the request
  has no valid bearer token.
- The frontend stores nothing additional in `localStorage`; no real session is
  forged. The chat widget simply reuses the existing `SKIP_AUTH_REDIRECT`
  HTTP context to avoid the auto-logout that would otherwise fire on the (now
  rare) 401 responses.
- The legacy `/chat`, `/voice`, `/audio`, `/audio-stream` routes are not
  exposed publicly; only the four documented `/v2/*` and `/chat/history/*`
  paths are exempted at the gateway.
- The intent-routing test failure noted above is pre-existing and tracked
  separately; this change does not regress it.

## Files changed

Modified:

- `ai-service/.env.example`
- `ai-service/config.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/models/agent_models.py`
- `weentime-backend/services/gateway/src/main/java/com/weentime/gateway/security/JwtGlobalFilter.java`
- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.production.ts`
- `weentime-frontend/angular-weentime/src/environments/environment.example.ts`

Added:

- `ai-service/app/context/anonymous_context.py`
- `ai-service/tests/test_chatbot_public_mode.py`
- `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md` (this document)
