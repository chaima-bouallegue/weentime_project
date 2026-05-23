# FE-AI-03 Voice Auth 401 Fix Report

## MCP tools used
- `filesystem` MCP: unavailable in this session. Local repository inspection was used instead.
- `playwright` MCP: unavailable in this session. Browser validation could not be executed from MCP.
- `context7` MCP: not used.

## Root cause
- `src/app/core/interceptors/auth.interceptor.ts` treated every protected `401` the same way.
- AI chat widget requests to `/ai/...` inherited the global behavior: clear auth state and redirect to `/login`.
- The widget voice flow then also surfaced the same failure as a generic audio error, producing broken UX and duplicated error handling.
- There is no refresh-token or token-renewal mechanism in the current frontend auth stack, so a safe retry-after-refresh path does not exist today.

## Files changed
- `src/app/core/http/request-context.tokens.ts`
- `src/app/core/interceptors/auth.interceptor.ts`
- `src/app/core/interceptors/auth.interceptor.spec.ts`
- `src/app/core/services/ai-copilot.service.ts`
- `src/app/shared/chat-widget/chat-widget.component.html`
- `src/app/shared/chat-widget/chat-widget.component.spec.ts`
- `src/app/shared/chat-widget/chat-widget.component.ts`
- `src/app/shared/chat-widget/chat.service.ts`
- `src/app/shared/chat-widget/voice-assistant.service.spec.ts`
- `src/app/shared/chat-widget/voice-assistant.service.ts`

## Auth interceptor fix
- Added AI chat-widget request context flags for:
  - skip global error toasts
  - skip automatic auth redirect
- Applied that context to chat, confirm, voice, fallback audio-stream, history, and TTS requests used by the widget.
- Kept the existing logout-and-redirect behavior for non-widget protected requests.
- No JWT bypass was introduced. Authorization headers still flow normally.

## Voice component fix
- Added explicit voice states:
  - `idle`
  - `listening`
  - `stopping`
  - `uploading`
  - `transcribing`
  - `responding`
  - `success`
  - `authExpired`
  - `audioError`
- `Stop` now emits a stopping state before final upload begins.
- `401` from the voice endpoint is mapped to `authExpired`, not to generic audio failure.
- Generic audio failures still map to `audioError`.
- Voice fallback to `/audio-stream` now happens only for availability failures (`0`/`404`), not for auth failures.

## UI state behavior
- The stop/voice button remains `type="button"`.
- When voice auth expires:
  - recording state is torn down cleanly
  - the widget stays open
  - no abrupt navigation is triggered from the widget
  - the UI shows `Votre session a expire. Veuillez vous reconnecter.`
  - a reconnect action is shown inline
- The voice button is disabled while auth is expired so the user is not pushed into a repeated failing loop.

## Playwright validation
- Playwright MCP was required by the task but was not registered in this session.
- Browser reproduction, network observation, console inspection, and no-redirect-loop validation could not be executed through MCP.
- Validation here is limited to code inspection, TypeScript/build validation, and focused automated unit tests.

## Build/typecheck results
- `npx tsc --noEmit -p tsconfig.app.json`: passed
- `npm run build`: passed
- Focused tests passed:
  - `npx vitest run src/app/core/interceptors/auth.interceptor.spec.ts src/app/shared/chat-widget/voice-assistant.service.spec.ts src/app/shared/chat-widget/chat-widget.component.spec.ts`

## Remaining limitations
- No refresh-token flow exists in the frontend, so expired sessions cannot be transparently renewed and retried once.
- Browser-level validation against a live expired token flow is still pending until Playwright MCP is available or the flow is tested manually.
- `npm run build` still reports pre-existing bundle/CommonJS warnings unrelated to this fix.

## Exact files staged
- `FE_AI_03_VOICE_AUTH_401_FIX_REPORT.md`
- `src/app/core/http/request-context.tokens.ts`
- `src/app/core/interceptors/auth.interceptor.ts`
- `src/app/core/interceptors/auth.interceptor.spec.ts`
- `src/app/core/services/ai-copilot.service.ts`
- `src/app/shared/chat-widget/chat-widget.component.html`
- `src/app/shared/chat-widget/chat-widget.component.spec.ts`
- `src/app/shared/chat-widget/chat-widget.component.ts`
- `src/app/shared/chat-widget/chat.service.ts`
- `src/app/shared/chat-widget/voice-assistant.service.spec.ts`
- `src/app/shared/chat-widget/voice-assistant.service.ts`

## Commit hash
- Recorded in task completion output after the final commit.
