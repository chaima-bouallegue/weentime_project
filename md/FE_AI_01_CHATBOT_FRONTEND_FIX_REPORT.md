# FE-AI-01 Chatbot Frontend Fix Report

## 1. MCP tools used
- Attempted MCP discovery with `list_mcp_resources` and `list_mcp_resource_templates`.
- Result: no registered MCP resources/templates were available in this session, and the expected `filesystem` / `playwright` servers were not registered.
- Fallback used: local shell inspection, Angular build/typecheck, and targeted Vitest execution.

## 2. Files inspected
- `src/app/app.routes.ts`
- `src/app/app.config.ts`
- `src/app/core/guards/role.guard.ts`
- `src/app/core/interceptors/api-error.interceptor.ts`
- `src/app/core/interceptors/auth.interceptor.ts`
- `src/app/core/interceptors/jwt.interceptor.ts`
- `src/app/core/services/api-config.service.ts`
- `src/app/core/services/ai-copilot.service.ts`
- `src/app/core/services/auth.service.ts`
- `src/app/core/utils/logger.ts`
- `src/app/features/shell/shell.component.ts`
- `src/app/features/shell/shell.routes.ts`
- `src/app/shared/chat-widget/chat-widget.component.ts`
- `src/app/shared/chat-widget/chat-widget.component.html`
- `src/app/shared/chat-widget/chat-widget.component.scss`
- `src/app/shared/chat-widget/chat.service.ts`
- `src/app/shared/chat-widget/voice-assistant.service.ts`
- `src/app/shared/chat-widget/voice-response-normalizer.ts`
- `src/environments/environment.ts`
- `src/environments/environment.example.ts`
- `src/environments/environment.production.ts`

## 3. Root causes found
- Chat v2 request payload did not match the required backend contract. It sent `channel` at the root instead of `metadata.channel`.
- AI gateway routing was implicit. The widget relied on the gateway URL in practice, but the transport layer did not make the gateway-first decision explicit.
- The overlay was mostly non-blocking already, but the host and drag shell still sized to content instead of collapsing to a zero-footprint container.
- Role awareness existed, but suggestions and header language did not clearly present Employee / Manager / RH / Admin AI modes.
- Confirmation flow had approve/cancel actions but weak resolved-state presentation.
- Voice responses did not surface detected language, audio status, or provider fallback information in the UI.
- Tool calls and action results were available in responses but not rendered.
- Route action failures could fail silently when guards rejected navigation.
- Short local session persistence was missing.

## 4. Overlay / click-blocking fix
- Collapsed the fixed host, widget root, and drag shell to zero-size containers with `overflow: visible`.
- Kept `pointer-events: none` on the overlay root and shell.
- Restricted interaction to the toggle, panel, and controls with `pointer-events: auto`.
- Left the widget mounted above the shell layout without creating a full-screen invisible hit target.

## 5. Chat contract implementation
- Updated AI chat transport to send:
  - `message`
  - `user_id`
  - `metadata.channel = "chat"`
  - `metadata.language = fr | en | ar | tn`
- Added explicit gateway-first AI endpoint resolution with debug fallback only when `aiServiceUrl` is absent.
- Normalized v2 response data for:
  - `requiresConfirmation`
  - `confirmationId`
  - `toolCalls`
  - `actionResult`
  - `fallback`
  - `detectedLanguage`
  - `audioStatus`
  - `warnings`

## 6. Confirmation UI behavior
- Kept approve / cancel inline actions.
- Added resolved-state labels:
  - `Action approved`
  - `Action cancelled`
- Preserved confirmation summaries when present.
- Prevented duplicate confirmation execution using the existing in-flight / resolved tracking.

## 7. Voice UI behavior
- Kept the existing single-blob `/v2/voice` flow and gateway routing.
- Added `metadata` and language hints to voice uploads.
- Preserved legacy `/audio-stream` fallback only when `/v2/voice` is unavailable.
- Surfaced voice-specific UI state:
  - recording
  - transcribing
  - generating reply
  - detected language badge
  - audio status badge
  - text-only fallback when TTS/audio is unavailable
- Added better voice error mapping for:
  - 401
  - 403
  - 429
  - gateway unavailable

## 8. Role suggestions
- Employee:
  - `Show my daily summary`
  - `Check my leave balance`
  - `Did I forget checkout?`
- Manager:
  - `Today's team summary`
  - `Pending approvals`
  - `Team attendance anomalies`
- RH:
  - `RH backlog`
  - `Pending validations`
  - `Document workload`
- Admin:
  - `System health`
  - `AI provider status`
  - `Tenant configuration issues`

## 9. Error handling
- Improved chat/voice error normalization for:
  - expired session
  - permission denied
  - AI route unavailable through gateway
  - provider unavailable
  - backend unavailable
  - rate limiting
  - invalid audio
- Added system feedback when router navigation is rejected by guards.
- Kept existing global interceptors intact; no JWT bypass was introduced.

## 10. Playwright validation results
- Playwright MCP browser validation could not be executed because the `playwright` MCP server was not registered in this session.
- As a result, the following could not be manually browser-verified via MCP in this task run:
  - role dashboard navigation
  - click-through behavior behind the widget in a live browser
  - network panel verification
  - console inspection
  - confirmation clicks in-browser
  - voice device/browser interaction
- Contract-level validation was completed from source inspection plus build/typecheck and targeted AI widget specs.

## 11. Build / typecheck results
- `npx tsc --noEmit -p tsconfig.app.json`
  - Passed
- `npm run build`
  - Passed
  - Existing non-task warnings remain:
    - bundle budget warnings
    - CommonJS dependency warnings
    - existing stylesheet budget warnings
- `npm test -- --watch=false`
  - Blocked by a pre-existing unrelated compile error in `src/app/features/manager/manager-api.service.spec.ts`
- Supplemental targeted validation:
  - `npx vitest run src/app/core/services/ai-copilot.service.spec.ts src/app/shared/chat-widget/voice-response-normalizer.spec.ts src/app/shared/chat-widget/voice-assistant.service.spec.ts`
  - Passed (`14` tests)

## 12. Remaining limitations
- No Playwright MCP in this session, so browser-level validation remains outstanding.
- Full Angular test suite is not clean because of the unrelated manager spec compile issue.
- Existing app bundle and stylesheet budget warnings remain outside FE-AI-01 scope.

## 13. Exact files staged
- `src/app/core/services/ai-copilot.service.ts`
- `src/app/core/services/ai-copilot.service.spec.ts`
- `src/app/shared/chat-widget/chat-widget.component.ts`
- `src/app/shared/chat-widget/chat-widget.component.html`
- `src/app/shared/chat-widget/chat-widget.component.scss`
- `src/app/shared/chat-widget/chat.service.ts`
- `src/app/shared/chat-widget/voice-assistant.service.ts`
- `src/app/shared/chat-widget/voice-assistant.service.spec.ts`
- `src/app/shared/chat-widget/voice-response-normalizer.ts`
- `src/app/shared/chat-widget/voice-response-normalizer.spec.ts`
- `FE_AI_01_CHATBOT_FRONTEND_FIX_REPORT.md`

## 14. Commit hash
- Recorded after commit in git history for this task run.
