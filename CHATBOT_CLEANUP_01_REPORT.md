# CHATBOT_CLEANUP_01_REPORT

## MCP tools used

- filesystem MCP: read the previous chatbot/STT/TTS reports, inspected AI API directories, voice files, frontend chat-widget files, and old frontend chat component files.
- playwright MCP: not used in this cleanup because the requested validation is compile/test based and no UI behavior changed in the current widget.
- postgres MCP: not needed; no database behavior was changed.
- docker MCP: not needed.

## Files inspected

AI service:

- `ai-service/main.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/api/router_loader.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/workflows/*`
- `ai-service/app/agents/*`
- `ai-service/app/tools/*`
- `ai-service/app/guards/*`
- `ai-service/app/providers/*`
- `ai-service/app/policy/*`
- `ai-service/app/voice_pipeline/*`
- `ai-service/agents/*`
- `ai-service/core/*`
- `ai-service/tools/*`
- `ai-service/voice/*`
- `ai-service/tests/*` references to legacy and v2 chatbot/voice routes

Frontend:

- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/*`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/*`
- `weentime-frontend/angular-weentime/src/app/features/shell/shell.component.ts`
- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`

## Dependency map

| File or flow | Imported/called by | Runtime/tests usage | Decision |
|---|---|---|---|
| `ai-service/app/api/chat_v2.py` | `main.py` router loader | Core v2 chatbot endpoint and tests | Keep |
| `ai-service/app/api/voice_v2.py` | `main.py` router loader | Core v2 voice endpoint and tests | Keep |
| `ai-service/app/core/copilot_engine.py` | v2 API, tests, runtime | Core deterministic/runtime orchestration | Keep |
| `ai-service/app/workflows/*` | copilot engine | Confirmation, guard, provider fallback and session flow | Keep |
| `ai-service/app/agents/*` | copilot engine | Current v2 agents and role copilots | Keep |
| `ai-service/app/tools/*` | ToolRegistry/executor | Current authority boundary | Keep |
| `ai-service/app/guards/*` | WorkflowOrchestrator | ResponseGuard safety layer | Keep |
| `ai-service/app/providers/*` | WorkflowOrchestrator/Admin health | ProviderRouter/Ollama/disabled provider | Keep |
| `ai-service/app/policy/*` | policy tools/agent | RAG and policy citation system | Keep |
| `ai-service/app/voice_pipeline/*` | `voice_v2.py` | Current v2 voice upload/STT/TTS pipeline | Keep |
| `ai-service/main.py:/audio-stream` | Angular `VoiceAssistantService` fallback and audio-stream tests | Legacy fallback still intentionally used when `/v2/voice` is unavailable | Keep legacy |
| `ai-service/main.py:/chat/history/{user_id}` | Angular `ChatService.getHistory()` and public-mode tests | Current widget still loads history through this route | Keep legacy |
| `ai-service/main.py:/tts` | Angular `ChatService.textToSpeech()` | Current widget can request TTS for a text message | Keep legacy until v2 TTS endpoint exists |
| `ai-service/main.py:/chat` | Angular `ChatService.sendLegacyMessage()` fallback, old tests | Fallback when `/v2/chat` returns 404 | Keep legacy compatibility |
| `ai-service/main.py:/voice` | no current widget call after cleanup; old legacy route/tests may still cover it | Deprecated voice route retained in backend for compatibility | Keep legacy backend for now |
| `ai-service/agents/*`, `ai-service/core/*`, `ai-service/tools/*` | `main.py` legacy endpoints and legacy tests | Older deterministic runtime still wired into `main.py` and compatibility tests | Keep legacy, do not delete in this task |
| `ai-service/voice/*` | v2 pipeline, legacy audio/voice routes, tests | Shared STT/TTS/conversion implementation | Keep |
| `weentime-frontend/.../shared/chat-widget/*` | `ShellComponent` imports `ChatWidgetComponent` | Current chatbot UI | Keep |
| `weentime-frontend/.../shared/components/chat/*` | No route/template/runtime import; only self-contained selector `app-chat` | Old standalone chatbot UI not used by current shell | Delete |
| `ChatService.sendVoice()` | No callers found by `rg` | Old frontend method posting to `/voice`; current voice uses `VoiceAssistantService` -> `/v2/voice` | Remove method |

## Files kept and why

- `ai-service/app/api/chat_v2.py`: current text chatbot endpoint.
- `ai-service/app/api/voice_v2.py`: current voice endpoint.
- `ai-service/app/core/copilot_engine.py`: current v2 runtime entrypoint.
- `ai-service/app/workflows/*`: active v2 orchestration and confirmation behavior.
- `ai-service/app/agents/*`: current domain and role agents.
- `ai-service/app/tools/*`: ToolRegistry authority boundary.
- `ai-service/app/guards/*`: ResponseGuard safety boundary.
- `ai-service/app/providers/*`: ProviderRouter and Ollama/disabled-provider contracts.
- `ai-service/app/policy/*`: policy/RAG system.
- `ai-service/app/voice_pipeline/*`: current v2 voice processor.
- `ai-service/main.py` legacy routes: kept because `/audio-stream`, `/chat/history`, `/tts`, `/chat`, and legacy tests still depend on them.
- `ai-service/agents`, `ai-service/core`, `ai-service/tools`: kept because `main.py` legacy compatibility paths import them.
- `ai-service/voice`: kept because both current v2 voice and compatibility routes/tests use these modules.
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/*`: kept because `ShellComponent` uses `ChatWidgetComponent` as the current UI.

## Files deleted and why

Deleted old unused Angular standalone chatbot component:

- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.ts`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.html`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.scss`

Reason:

- `rg` found no runtime import, no route usage, and no `<app-chat>` template usage.
- The active shell imports and renders `<app-chat-widget />`, not `<app-chat>`.
- This component used the old `ChatService` surface and was a duplicate chatbot UI.

Removed old unused frontend method:

- `ChatService.sendVoice()` in `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat.service.ts`

Reason:

- `rg` found no calls to `sendVoice()`.
- Current voice flow uses `VoiceAssistantService` with `/v2/voice`, with `/audio-stream` fallback only on v2 unavailability.
- Removing this method eliminates a stale frontend caller for old `/voice` without deleting backend compatibility.

Also removed the now-unused private `normalizeNoSpeechResponse()` helper and stale `NO_SPEECH_MESSAGE` constant from `ChatService`.

## Legacy flows remaining

These remain intentionally:

- `/audio-stream`: still used by Angular `VoiceAssistantService` as fallback when `/v2/voice` is unavailable and by audio-stream tests.
- `/audio-stream/result/{session_id}`: paired with legacy stream flow.
- `/chat/history/{user_id}`: still used by the current chat widget history loader.
- `/tts`: still used by `ChatService.textToSpeech()` for text-to-speech playback from the widget.
- `/chat`: retained as v2-chat 404 fallback path in `ChatService.sendLegacyMessage()` and old compatibility tests.
- `/voice`: backend legacy route retained for compatibility tests and old clients, even though the current Angular widget no longer calls it.
- top-level `agents`, `core`, `tools`: retained because `main.py` still wires the legacy deterministic runtime and tests still cover it.

## Risks

- The legacy backend routes still exist, so the cleanup is not a full legacy runtime removal. This is deliberate to avoid breaking current fallbacks and tests.
- `ChatService.getHistory()` and `ChatService.textToSpeech()` still depend on legacy-style endpoints until v2 equivalents are introduced.
- Angular build continues to report existing budget/CommonJS warnings unrelated to this cleanup.
- Optional AI router warning for missing `app.api.document_generation` still appears at import time and remains intentionally optional.

## Validation results

AI service:

- `python -c "import main; print('ok')"` -> passed, output `ok`.
- `python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_tool_registry.py tests/test_response_guard.py -v` -> 24 passed, 1 warning.

Frontend:

- `npx tsc --noEmit -p tsconfig.app.json` -> passed.
- `npm run build` -> passed with existing budget/CommonJS warnings.

Backend:

- No Spring backend files changed; no backend compile required.

## Exact staged files

To stage for this task only:

- `CHATBOT_CLEANUP_01_REPORT.md`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.ts`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.html`
- `weentime-frontend/angular-weentime/src/app/shared/components/chat/chat.component.scss`

## Next task recommendation

Introduce v2 replacements for the remaining intentional legacy frontend dependencies before deleting backend legacy routes:

1. Add `/v2/chat/history` or move history to frontend-local/session-backed storage.
2. Add `/v2/tts` or route TTS through `/v2/voice` response contracts.
3. Remove `/chat` fallback only after the gateway and current deployments guarantee `/v2/chat` availability.
4. Remove `/audio-stream` only after `/v2/voice` browser reliability is proven in production-like testing.

## Commit hash

Pending before commit; final commit hash is recorded in the assistant response after `git commit` succeeds.
