# WeenTime Chatbot / STT / TTS Analysis Plan

Task: MASTER-AI-CHATBOT-STT-01  
Project root: `C:\Users\DELL\Documents\GitHub\weentime_project`  
Date: 2026-05-17

## 1. MCP tools used

- `filesystem` MCP: inspected `ai-service`, `weentime-backend/services`, and `weentime-frontend/angular-weentime/src/app` structure and key files.
- `postgres` MCP: attempted read-only schema inspection with `information_schema.tables`; connection failed with password authentication error for user `postgres`. No database reads or writes were performed.
- `playwright` MCP: attempted browser validation at `http://localhost:4200`; connection refused because the Angular dev server is not currently running.
- `context7`, `redis`, `docker`: not required for the initial analysis pass.

## 2. Backend services discovered

| Service | Main role | Relevant modules/controllers found |
|---|---|---|
| `gateway` | Local API gateway on standard local target `http://localhost:8322/api/v1` | route/security config inspected from previous reports and service tree |
| `auth-service` | Authentication and JWT issuance | `AuthController`, `HealthController` |
| `organisation-service` | Users, enterprises, teams, departments, managers, notifications | `UserController`, `UtilisateurController`, `EntrepriseController`, `DepartementController`, `EquipeController`, `RhManagementController`, `StructureController`, notification controllers |
| `rh-service` | Leave, telework, authorization, documents, RH dashboards, meetings/planning | `CongeController`, `TeletravailController`, `AutorisationController`, `DocumentController`, `DemandeController`, `RhDashboardCompatibilityController`, `ReunionController`, `RhPlanningController`, `JourFerieController` |
| `presence-service` | Pointage, attendance, horaires, presence stats | `PresenceController`, pointage compatibility controllers, `HoraireController` |
| `communication-service` | Channels, messages, realtime events, notifications/websocket | `ChannelController`, `MessageController`, `RealtimeEventController`, websocket controllers |

## 3. Frontend chatbot structure

| File | Role |
|---|---|
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.ts/html/scss` | Chat UI, quick prompts, confirmation cards, message rendering, voice controls |
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat.service.ts` | Normalizes AI responses for widget, maps errors, confirmation/reset wrappers |
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts` | Browser microphone capture, final blob upload to `/v2/voice`, legacy `/audio-stream` fallback |
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/safe-text.util.ts` | Defensive display helpers for unknown values |
| `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts` | V2 chat/confirm/reset client using gateway AI route |
| `weentime-frontend/angular-weentime/src/environments/environment.ts` | Local gateway URLs; `aiServiceUrl` currently points to `http://localhost:8322/api/v1/ai` |

Findings:

- Text chat uses `/v2/chat` through the gateway AI route.
- Confirm/reset use `/v2/chat/confirm` and `/v2/chat/reset`.
- Voice uses `/v2/voice` first and falls back to legacy `/audio-stream` only on `0` or `404`.
- Metadata includes role/user/enterprise/language, but text/confirm/reset metadata does not yet include the explicit `chatbotPublicContext: true` marker required by this task.
- Voice metadata includes role/user/enterprise/language but also lacks explicit `chatbotPublicContext: true`.
- UI already has safe text utilities and structured cards, but fallback/error rendering still needs validation after backend fixes.

## 4. AI service structure

| Area | Current files / components |
|---|---|
| FastAPI routes | `main.py`, `app/api/chat_v2.py`, `app/api/voice_v2.py`, `app/api/health_v2.py`, `app/api/router_loader.py` |
| Context/security | `app/context/context_builder.py`, `jwt_parser.py`, `current_user.py`, `anonymous_context.py`, `chatbot_backend_token.py` |
| Runtime orchestration | `app/core/copilot_engine.py`, `app/workflows/workflow_orchestrator.py`, `app/core/conversation_state.py`, `app/core/slot_filling.py` |
| Agents | `attendance_agent`, `leave_agent`, `document_agent`, `telework_agent`, `authorization_agent`, `manager_agent`, `rh_agent`, `admin_agent`, `communication_agent`, `organisation_agent`, `reunion_agent`, role copilots, `hr_policy_agent`, `legacy_agent`, `router_agent` |
| Tool authority | `app/tools/registry.py`, `executor.py`, domain tool files |
| Guard/fallback | `app/guards/response_guard.py`, `app/guards/rules.py`, `app/core/deterministic_fallback.py` |
| Provider | `app/providers/router.py`, `ollama_provider.py`, disabled provider, request/response contracts |
| RAG/policy | `app/policy/*`, `app/tools/policy_tools.py`, `app/agents/hr_policy_agent.py` |
| Voice | top-level `voice/stt.py`, `voice/tts.py`, `voice/cleaner.py`, `voice/vad.py`, `voice/whisper_service.py`; v2 processor in `app/voice_pipeline/voice_request_processor.py` |
| Observability | `app/observability/*`, Braintrust helpers and request correlation |

## 5. Database tables relevant to chatbot domains

Postgres MCP read-only inspection failed because the configured MCP connection cannot authenticate as `postgres`. The current table understanding is therefore derived from Spring entities/repositories/controllers only:

| Domain | Expected backing data based on backend code |
|---|---|
| users | `Utilisateur`, user profile/auth integration repositories in organisation-service |
| enterprises | `Entreprise` and related organisation repositories |
| departments | `Departement` repositories/controllers |
| teams | `Equipe` repositories/controllers |
| pointage/presence | presence sessions, pointage compatibility, attendance session repositories in presence-service |
| leave | `Conge`, solde/type conge repositories and controllers in rh-service |
| telework | telework request/config repositories/controllers in rh-service |
| authorization | autorisation repositories/controllers in rh-service |
| documents | document request/generation/status repositories/controllers in rh-service |
| communication | channels, messages, notifications, realtime event repositories/controllers in communication-service |
| meetings/planning | `ReunionController`, `RhPlanningController`, presence `HoraireController`; AI has reunion tools but no full planning/horaire tool yet |

## 6. Endpoint map

| Frontend need | Angular path | Gateway URL | Backend/API endpoint | Controller/service path | Table/source |
|---|---|---|---|---|---|
| Text chat | `AiCopilotService.sendChatV2` | `/api/v1/ai/v2/chat` | AI FastAPI `/v2/chat` | `app/api/chat_v2.py` -> `WorkflowOrchestrator` | ToolRegistry/backend as needed |
| Confirm action | `AiCopilotService.confirmAction` | `/api/v1/ai/v2/chat/confirm` | AI FastAPI `/v2/chat/confirm` | `WorkflowOrchestrator.confirm_action` | ConfirmationStore + ToolExecutor |
| Reset session | `AiCopilotService.resetSession` | `/api/v1/ai/v2/chat/reset` | AI FastAPI `/v2/chat/reset` | `chat_v2.py` | Conversation/confirmation stores |
| Voice | `VoiceAssistantService.uploadAssembled` | `/api/v1/ai/v2/voice` | AI FastAPI `/v2/voice` | `voice_v2.py` -> `VoiceRequestProcessor` | STT/TTS + ToolRegistry |
| Legacy voice fallback | `VoiceAssistantService` fallback | `/api/v1/ai/audio-stream` | AI FastAPI `/audio-stream` | `main.py` legacy route | legacy STT/session path |
| Pointage personal | Chat prompt -> `AttendanceAgent` | AI ToolRegistry | `/presence/me/today`, `/presence/me/check-in`, `/presence/me/check-out`, `/presence/me/stats` | presence-service `PresenceController` | presence DB |
| Team/company presence | Manager/RH/Admin prompt -> `AttendanceAgent` | AI ToolRegistry | `/presence/team/today`, `/presence/company/today`, `/presence/global/analytics` | presence-service | presence DB |
| Leave | `LeaveAgent` | AI ToolRegistry | `/rh/conges/*`, `/leave-balances` compatibility | rh-service `CongeController`, compatibility controllers | leave tables |
| Telework | `TeleworkAgent` | AI ToolRegistry | `/rh/teletravail/*`, `/teletravail` compatibility | rh-service telework controllers | telework tables |
| Authorization | `AuthorizationAgent` | AI ToolRegistry | `/rh/autorisations/*` | `AutorisationController` | authorization tables |
| Documents | `DocumentAgent` | AI ToolRegistry | `/documents`, `/documents/mes-demandes`, `/documents/rh/demandes`, `/documents/rh/stats`, `/documents/rh/generate-ai` | `DocumentController` | document tables/storage |
| Meetings | `ReunionAgent` | AI ToolRegistry | `/rh/reunions/mes-reunions`, `/rh/reunions/prochaine` | `ReunionController` | reunion tables |
| Planning/horaire | `ReunionAgent` capability fallback | AI ToolRegistry not wired | module exists but no friendly AI planning tool yet | `HoraireController` / planning controllers | planning/horaire DB |
| Communication | `CommunicationAgent` | AI ToolRegistry | `/communication/channels`, `/communication/channels/{id}/messages`, send message | communication-service controllers | communication DB |
| Admin diagnostics | `AdminAgent`, `AdminDigestBuilder` | AI local tools/backend reads | health/provider/Redis/RAG/admin reads | AI tools + backend admin endpoints | config/backend reads |
| Policy/FAQ | `HRPolicyAgent` | AI policy tools | local keyword/Chroma policy retriever | `app/policy/*` | approved policy docs only |

## 7. AI ToolRegistry map

| Capability | AI agent | Tool(s) | Backend/source | Notes |
|---|---|---|---|---|
| Pointage status | `AttendanceAgent` | `get_pointage_status` | `/presence/me/today` | Read-only, all roles personal |
| Check-in/out | `AttendanceAgent` | `check_in`, `check_out` | `/presence/me/check-in`, `/presence/me/check-out` | Write, confirmation required |
| Week hours/history | `AttendanceAgent` | `get_week_hours`, `get_presence_history` | presence-service | Read-only |
| Team/company presence | `AttendanceAgent` | `get_team_presence` | role-specific presence endpoints | Employee returns `capability_unavailable` |
| Documents | `DocumentAgent` | `document.list_my_requests`, `document.create_request`, `document.get_status`, `document.open`, `document.rh_workload`, `document.rh_generate`, `document.rh_reject` | rh-service documents | Writes require confirmation |
| Leave | `LeaveAgent` | leave list/balance/status/create/decision tools | rh-service conges | Writes require confirmation |
| Telework | `TeleworkAgent` | telework list/status/create/decision tools | rh-service telework | Writes require confirmation |
| Authorization | `AuthorizationAgent` | authorization list/status/create/decision tools | rh-service autorisations | Writes require confirmation |
| Manager approvals | `ManagerAgent` | manager list/detail/decision tools | leave/telework/authorization tools | Detail-before-confirmation present |
| RH backlog/validations | `RHAgent` | `rh.get_stats`, `document.rh_workload`, leave/telework/authorization/document read/decision tools | rh-service | Detail-before-confirmation present for decision flows |
| Admin health | `AdminAgent` | `admin.system_health`, `admin.provider_status`, `admin.redis_status`, `admin.braintrust_status`, `admin.rag_status` | local config/health + backend reads | Read-only diagnostics |
| Meetings | `ReunionAgent` | `reunion.list_mine`, `reunion.next`, `reunion.get_detail` | rh-service reunion endpoints | Planning-only returns unavailable |
| Communication | `CommunicationAgent` | communication tools | communication-service | Membership enforced by backend |
| Policy/FAQ | `HRPolicyAgent` | policy search tools | local keyword/Chroma | Citations required |

## 8. Missing tools/endpoints

- Full personal planning/horaire tool is not wired; current AI behavior should return `planning.unavailable` instead of unsafe fallback.
- Meeting creation/calendar writes are not part of the current modern AI toolset; should return `capability_unavailable` unless verified later.
- Advanced analytics, predictive HR, recruitment, training, DB backup/restore, service restart, and autonomous report generation should return `capability_unavailable` unless an explicit backend-supported tool exists.
- Public chatbot metadata path exists but is currently controlled by `CHATBOT_PUBLIC_MODE`; the task requires metadata fallback for chatbot endpoints without blocking testing on JWT 401.
- Chat reset appears to reference `services["copilot_context_builder"]`, but `ensure_copilot_services()` returns `context_builder`; this is likely a runtime reset bug.

## 9. Current broken routing causes

Likely causes from code inspection:

1. Public/demo chat can still return 401 if `CHATBOT_PUBLIC_MODE` is false, even when request metadata contains role/user/enterprise.
2. Text/voice metadata lacks an explicit `chatbotPublicContext` marker, making it harder for backend to distinguish public chatbot fallback from normal authenticated runtime.
3. `RouterAgent` does deterministic routing, but `role_action_agent` and candidate ordering must keep pointage/planning/RH/admin prompts from falling to legacy/provider fallback.
4. Some unsupported features need explicit `capability_unavailable` responses before they hit guard/provider fallback.
5. Slot filling exists in `continue_pending_flow`, but follow-up reliability needs tests for `pour demain`, telework, document type asks, and Tunisian forms.

## 10. ResponseGuard false positives

The guard already allowlists many deterministic kinds and intents, including:

- `capability_unavailable`
- `planning.unavailable`
- `meeting.unavailable`
- role summaries/digests
- manager/RH pending summaries
- admin health/provider/Redis/RAG reports
- slot-filling and confirmation summaries

Remaining risk areas:

- New safe chatbot output kinds or intents may still be converted to `fallback.guard_rejected` unless added to safe evidence/intent allowlists.
- No-data read results must carry `kind=read_result` or `kind=capability_unavailable`; otherwise natural text such as counts/statuses may trip hallucination rules.
- Tool-like text from providers must not be treated as execution evidence.

## 11. STT/TTS issues

Current v2 voice path:

`UploadFile -> VoiceRequestProcessor.store_upload -> voice.stt.SpeechToTextService -> convert_to_wav -> VAD/audio metrics -> faster-whisper -> cleaner -> language detect -> copilot/role router -> ResponseGuard -> TTS`

Findings:

- STT minimum input size defaults to `5000` bytes and duration defaults to `1.5s`; short commands are supported in cleaner, but very short low-byte browser captures may still be rejected as `short_audio`.
- VAD no-speech does not automatically reject if signal is meaningful, which is good, but low volume thresholds still need validation.
- v2 voice uses finalized upload flow. Legacy `/audio-stream` still exists and assembles chunks server-side.
- Cancellation is handled in v2 and legacy streaming paths.
- TTS fails safely by returning `audioStatus=unavailable` in v2 voice.
- Multilingual handling uses `detect_language`, language hints, and TTS language routing; needs tests for FR/EN/AR/TN command phrases.

## 12. UI issues

Potential UI issues to verify/fix:

- Repeated fallback cards may appear if backend returns `fallback.guard_rejected` or `fallback.unsafe_response` for supported or explicitly unavailable prompts.
- `ChatService.fromV2Envelope()` maps failed envelopes into normal message text but still sets `status='error'`; UI should not render raw JSON.
- Safe display helpers exist; compile/tests should verify no `value.trim` crash path remains.
- Quick prompts exist in the component; role-specific prompt coverage needs validation.
- Browser validation cannot proceed until Angular dev server is running.

## 13. Exact implementation tasks ordered by priority

1. **Public chatbot metadata context**
   - Update AI `/v2/chat`, `/v2/voice`, `/v2/chat/confirm`, `/v2/chat/reset` to accept explicit `chatbotPublicContext: true` metadata even if `CHATBOT_PUBLIC_MODE` is false.
   - Preserve verified JWT path when Authorization is valid.
   - Preserve ToolRegistry/confirmation/backend authority.
   - Add/adjust frontend metadata to send `chatbotPublicContext: true` for text, voice, confirm, reset.

2. **Chat reset compatibility**
   - Replace stale `services["copilot_context_builder"]` usage with `services["context_builder"]` and await the async builder.
   - Add tests for public reset and verified reset.

3. **Routing/capability hardening**
   - Add tests and targeted routing fixes for pointage, planning/meetings, manager pending approvals, RH backlog/validations/presence, admin health/provider/Redis/Braintrust/RAG prompts.
   - Ensure unsupported modules return `capability_unavailable` not fallback.

4. **ResponseGuard allowlist/evidence hardening**
   - Add safe chatbot output tests for no-data, capability unavailable, admin diagnostics, pointage, RH backlog, manager summary, document workload.
   - Only allow deterministic/tool-backed kinds; continue rejecting fake HR data/secrets/success claims.

5. **Slot filling and follow-ups**
   - Test and fix `pour demain` continuation for telework/leave/document/authorization.
   - Ensure missing chips disappear once fields are filled.

6. **Voice/STT/TTS stabilization**
   - Add/adjust tests for FR/EN/AR/TN transcripts, short HR commands, TTS unavailable behavior, no-crash STT unavailable behavior.
   - Tune thresholds only if tests or runtime evidence proves current defaults still reject valid short commands.

7. **Frontend UX validation/fixes**
   - Compile Angular.
   - If app can run, Playwright validate all four role prompt sets.
   - Ensure fallback cards are not spammed and capability-unavailable cards are clean.

8. **Reports, validation, commit**
   - Create `WEENTIME_CHATBOT_STT_TTS_FIX_REPORT.md`.
   - Run AI and frontend validation commands.
   - Stage only related files and commit with `fix(ai): stabilize multilingual role chatbots and voice`.
