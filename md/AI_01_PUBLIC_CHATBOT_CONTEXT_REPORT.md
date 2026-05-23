# AI-01 Public Chatbot Context Report

## Files Changed

- `ai-service/app/context/anonymous_context.py`
- `ai-service/tests/test_chatbot_public_context.py`
- `AI_01_PUBLIC_CHATBOT_CONTEXT_REPORT.md`

No Angular source changes were required after inspection because the current chatbot services already send `chatbotPublicContext` metadata for chat, confirm, reset, and voice requests.

## Root Cause

The runtime already had the correct metadata-based public chatbot context behavior, but regression coverage was incomplete for several AI-01 requirements:

- Invalid JWT plus explicit `metadata.chatbotPublicContext=true` was not directly covered.
- Valid JWT precedence over spoofed metadata was not directly covered.
- Public metadata confirmation and reset behavior without global `CHATBOT_PUBLIC_MODE` was not directly covered.
- The anonymous context module documentation still described the older global-public-mode-only model.

## Public Context Behavior

Chatbot public context remains scoped to chatbot endpoints only:

- `POST /v2/chat`
- `POST /v2/voice`
- `POST /v2/chat/confirm`
- `POST /v2/chat/reset`

Behavior preserved and tested:

- Valid Authorization header wins and uses the verified JWT path.
- Missing Authorization plus `metadata.chatbotPublicContext=true` builds chatbot metadata context.
- Invalid Authorization plus `metadata.chatbotPublicContext=true` falls back to chatbot metadata context for chatbot endpoints only.
- Missing Authorization without public metadata still returns `401 missing_jwt` unless global `CHATBOT_PUBLIC_MODE` is enabled.
- Invalid roles fall back to `EMPLOYEE`.
- Metadata context is tagged with `source="chatbot_metadata"`, `chatbot_public_context=true`, and `jwt_verified=false`.
- Requests continue through the normal RouterAgent, ToolRegistry, WorkflowOrchestrator, confirmation flow, and ResponseGuard.

## Frontend Metadata Behavior

Inspected Angular services:

- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`

Observed behavior:

- Chat requests include `metadata.chatbotPublicContext` from `environment.chatbotPublicMode`.
- Confirm requests include `metadata.chatbotPublicContext` from `environment.chatbotPublicMode`.
- Reset requests include `metadata.chatbotPublicContext` from `environment.chatbotPublicMode`.
- Voice requests include JSON form metadata with `chatbotPublicContext`, role, userId, entrepriseId, channel, and language.

No frontend code change was needed.

## Security Guarantees Preserved

- JWT verification remains strict for normal authenticated runtime paths.
- Public metadata context is not a verified JWT; it keeps `jwt_verified=false`.
- Metadata cannot inject arbitrary permissions.
- Permissions are derived only from canonical role mapping.
- Invalid role defaults to `EMPLOYEE`.
- ToolRegistry remains the permission authority for tool execution.
- Write actions still require confirmation.
- Spring backend APIs were not opened publicly.
- Backend remains authoritative for business data and mutations.
- ResponseGuard remains active.

## Tests Added/Updated

Updated `tests/test_chatbot_public_context.py` with coverage for:

- Invalid JWT plus `chatbotPublicContext=true` succeeds through public metadata context.
- Valid JWT wins over spoofed public metadata.
- Public metadata write prompt creates a confirmation instead of executing directly.
- Public metadata confirmation works without global public mode.
- Public metadata reset works without global public mode.

## Validation Results

AI service:

```text
python -c "import main; print('ok')"
ok
```

Note: startup still logs the existing optional-router warning for missing `app.api.document_generation`; this is unrelated to AI-01 and remains non-blocking.

Targeted AI tests:

```text
python -m pytest tests/test_chatbot_public_context.py tests/test_chatbot_public_mode.py tests/test_chat_v2.py tests/test_voice_v2.py -v
33 passed, 1 warning
```

Frontend:

```text
npx tsc --noEmit -p tsconfig.app.json
passed
```

```text
npm run build
passed
```

Build warnings were existing Angular budget/CommonJS warnings and did not fail the build.

## Exact Files Staged

Planned AI-01 staging set:

- `AI_01_PUBLIC_CHATBOT_CONTEXT_REPORT.md`
- `ai-service/app/context/anonymous_context.py`
- `ai-service/tests/test_chatbot_public_context.py`

## Commit Hash

Pending until commit creation. The final assistant response records the created commit hash.
