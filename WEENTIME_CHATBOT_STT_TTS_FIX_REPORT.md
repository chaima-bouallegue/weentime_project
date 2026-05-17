# WEENTIME_CHATBOT_STT_TTS_FIX_REPORT

## 1. MCP tools used

- filesystem MCP: inspected AI service agents, APIs, NLP, frontend chatbot services, and test files.
- playwright MCP: loaded the Angular app at `http://127.0.0.1:4200` after a temporary dev-server start; the landing page rendered and no browser console warnings/errors were returned by Playwright.
- postgres MCP: attempted read-only schema inspection; connection failed with PostgreSQL password authentication error for user `postgres`, so no database data was read or modified.

## 2. Project analysis summary

The WeenTime AI chatbot is routed through FastAPI v2 endpoints, deterministic agents, ToolRegistry, ResponseGuard, ProviderRouter, Role Intelligence, policy/RAG tools, and voice/STT/TTS services. The frontend chat widget and voice service call the v2 AI API through configured gateway/AI URLs and now include explicit chatbot-public metadata when public chatbot mode is enabled.

## 3. Database/backend/frontend map

- Frontend text chat: Angular chat widget -> `AiCopilotService` -> `/v2/chat` -> `chat_v2.py` -> `process_copilot_message` -> `WorkflowOrchestrator` -> `RouterAgent` -> domain/role agents -> ToolRegistry -> backend client.
- Frontend voice chat: Angular voice widget -> `VoiceAssistantService` -> `/v2/voice` -> `voice_v2.py` -> STT/cleaning/language metadata -> copilot engine -> optional TTS.
- Presence/pointage: chatbot prompt -> `AttendanceAgent` -> `get_pointage_status`, `check_in`, `check_out`, `get_week_hours`, `get_team_presence` -> presence backend endpoints.
- Leave: chatbot prompt -> `LeaveAgent` -> leave tools -> RH backend leave endpoints.
- Telework: chatbot prompt -> `TeleworkAgent` + slot filling -> telework tools -> RH backend telework endpoints.
- Documents: chatbot prompt -> `DocumentAgent` -> document tools -> document backend endpoints.
- RH backlog/stats/document workload: chatbot prompt -> `RHAgent` / `RHCopilot` -> `rh.get_stats`, `leave.list_rh_pending`, `telework.list_rh_pending`, `authorization.list_rh_requests`, `document.rh_workload`.
- Admin diagnostics: chatbot prompt -> `AdminAgent` / admin read tools -> safe diagnostics/provider/Redis/RAG status.
- Policy/RAG: policy prompt -> `HRPolicyAgent` -> `policy.explain_rule` -> local keyword/Chroma-capable policy retriever with citations required.

Postgres schema inspection was not available because the MCP database credentials failed authentication; table mapping is therefore based on backend code/tool contracts already present in the repository.

## 4. Screenshots/problems analyzed

No new screenshots were attached in this task. The reported problems were reproduced through code inspection, pytest coverage, and Playwright app-load validation. Playwright could load the Angular landing page, but full role-chat browser scenarios were not executed because backend/gateway authenticated role sessions were not running in this environment.

## 5. Root causes

- Public chatbot fallback was only controlled by global `CHATBOT_PUBLIC_MODE`, so metadata-driven demo/public chat requests could still be blocked by JWT 401.
- Voice endpoint had the same metadata gap for public chatbot context.
- Chat reset used a stale service key (`copilot_context_builder`) and missed awaiting the async context builder.
- Arabic leave creation normalized `إجازة` to `اجازه`, but that normalized variant was not mapped back to `congé`.
- `match_intent` did not recognize `nheb npointi`, `npointi`, or `check me in` as deterministic check-in intents.
- `Je viens d'arriver` retained an apostrophe and missed the check-in branch.
- Employee collective pointage prompts like `Pointage equipe` fell back to personal status instead of returning a clean capability-unavailable response via the team-presence tool.
- RH/Admin role copilots captured direct operational prompts (`RH backlog`, `System health`) before the more precise RH/Admin agents.
- Greeting small talk such as `bonjour comment ça va` could fall to unsafe fallback.

## 6. Public chatbot context behavior

For `/v2/chat`, `/v2/chat/confirm`, `/v2/chat/reset`, and `/v2/voice`:

- Valid Authorization header still uses verified JWT context.
- Missing/invalid Authorization can use chatbot metadata only when metadata explicitly contains `chatbotPublicContext: true` or `chatbot_public_context: true`, or when global `CHATBOT_PUBLIC_MODE` is enabled.
- Metadata context uses `source="chatbot_metadata"`, role/user/enterprise from metadata with safe defaults, and still goes through normal copilot routing.
- ToolRegistry still enforces role permissions.
- Write actions still require confirmation.
- Spring backend security remains authoritative.

## 7. Role capability matrix implemented

- EMPLOYEE: validated leave balance, document request confirmation, daily briefing, pointage status/check-in/forgot-checkout, telework slot-filling, meetings/planning unavailable handling.
- MANAGER: validated pending approvals, personal pointage, team presence, approval detail-before-confirmation behavior.
- RH: validated RH backlog modern reads, company presence, RH create-user capability-unavailable message, document workload.
- ADMIN: validated system health, provider status, Redis status, and create-user missing-field/confirmation flow.

Unsupported backend capabilities are expected to return `capability_unavailable` or clean unavailable sections, not raw HTTP errors or guard fallback cards.

## 8. Multilingual STT/TTS behavior

- FR/EN/TN/AR routing tests now cover leave and pointage prompts.
- Arabic leave creation now normalizes `إجازة/اجازه` to `congé` and routes to `LeaveAgent`.
- Tunisian/franco terms such as `nheb npointi` and `npointi` route deterministically to check-in.
- STT cleaner tests confirm short Tunisian HR commands are preserved.
- TTS unavailable behavior remains non-fatal and returns text safely.

## 9. Intent routing changes

- Added deterministic intent patterns for `check me in`, `nheb npointi`, and `npointi`.
- Added apostrophe-aware arrival detection for `je viens d'arriver` / `viens d'arriver`.
- Team pointage prompts now route to team-presence handling so unauthorized employees get clean capability-unavailable responses.
- RH presence prompts have higher RHAgent confidence so `Presence aujourd'hui` routes to RH company presence.
- `RH backlog` is no longer swallowed by RHCopilot daily briefing; RHAgent handles the backlog read.
- `System health` is no longer swallowed by AdminCopilot summary; AdminAgent handles the direct health read.
- Greeting small talk is handled before fallback/provider routing.

## 10. Slot filling changes

No broad slot-filling rewrite was required. Tests verify that:

- `je veux un teletravail` creates an ask response and captures pending flow.
- `pour demain` continues the pending telework flow and returns confirmation.
- document request asks only for missing document type.
- cancel clears pending flow.
- `pourquoi` explains the last recorded error.

## 11. ToolRegistry/RAG/LLM behavior

- ToolRegistry remains the only execution authority.
- Provider/Ollama output cannot execute tools directly.
- Provider-disabled mode preserves deterministic chatbot responses.
- RAG/policy answers still require citations; missing policy sources return unavailable.
- No fake leave balances, fake attendance status, fake approvals, fake unread counts, or fake system status were introduced.

## 12. ResponseGuard changes

No direct ResponseGuard code change was needed. New tests verify guard acceptance for:

- capability-unavailable chatbot cards.
- tool-backed pointage status.
- role digests.

New tests also verify guard rejection for fake leave balance without tool evidence.

## 13. Frontend UI fixes

Frontend request metadata now includes `chatbotPublicContext` for:

- text chat requests.
- confirmation requests.
- reset requests.
- voice requests.

This lets the chatbot widget exercise the public/demo context path when `environment.chatbotPublicMode === true`, without hardcoding LLM keys or bypassing backend authority.

## 14. Playwright validation

- Started Angular dev server temporarily on `127.0.0.1:4200`.
- Playwright navigated to `http://127.0.0.1:4200` successfully.
- Page title: `WeenTime — Le temps de vos talents`.
- Console check returned no warnings/errors.
- Full role-chat browser validation was not completed because backend/gateway authenticated role sessions were not running in this environment.

## 15. Tests added/updated

Added:

- `ai-service/tests/chatbot_test_helpers.py`
- `ai-service/tests/test_admin_agent_chatbot.py`
- `ai-service/tests/test_employee_agent_chatbot.py`
- `ai-service/tests/test_manager_agent_chatbot.py`
- `ai-service/tests/test_meeting_planning_intents.py`
- `ai-service/tests/test_multilingual_chatbot_routing.py`
- `ai-service/tests/test_pointage_intents.py`
- `ai-service/tests/test_provider_usage_chatbot.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`
- `ai-service/tests/test_rh_agent_chatbot.py`
- `ai-service/tests/test_slot_filling_followups.py`
- `ai-service/tests/test_stt_multilingual_chatbot.py`
- `ai-service/tests/test_tts_chatbot.py`

Updated:

- `ai-service/tests/test_chatbot_public_context.py`
- `ai-service/tests/test_chatbot_public_mode.py`

## 16. Validation results

AI import:

- `python -c "import main; print('ok')"` -> passed (`ok`).

AI chatbot/STT/TTS test matrix:

- `python -m pytest tests/test_chatbot_public_context.py tests/test_multilingual_chatbot_routing.py tests/test_employee_agent_chatbot.py tests/test_manager_agent_chatbot.py tests/test_rh_agent_chatbot.py tests/test_admin_agent_chatbot.py tests/test_pointage_intents.py tests/test_meeting_planning_intents.py tests/test_slot_filling_followups.py tests/test_stt_multilingual_chatbot.py tests/test_tts_chatbot.py tests/test_response_guard_chatbot_outputs.py tests/test_provider_usage_chatbot.py -v` -> 61 passed, 1 warning.

AI regression:

- `python -m pytest tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard.py tests/test_role_intelligence.py tests/test_tool_registry.py -v` -> 31 passed, 5 warnings.

Frontend:

- `npx tsc --noEmit -p tsconfig.app.json` -> passed.
- `npm run build` -> passed with existing budget/CommonJS warnings.

Backend:

- No backend source files changed; no Spring service compile was required.

## 17. Remaining limitations

- PostgreSQL MCP read-only inspection is blocked by local password authentication for user `postgres`.
- Full authenticated browser validation for Employee/Manager/RH/Admin chat flows requires the full gateway/backend stack and seeded role sessions.
- Angular build still reports pre-existing budget/CommonJS warnings.
- Optional API router warning for `app.api.document_generation` remains at import time, but it is loaded as optional and does not block startup.

## 18. Exact staged files

To stage for this task only:

- `WEENTIME_CHATBOT_STT_TTS_ANALYSIS_PLAN.md`
- `WEENTIME_CHATBOT_STT_TTS_FIX_REPORT.md`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/attendance_agent.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/role_copilots/rh_copilot.py`
- `ai-service/app/agents/role_copilots/admin_copilot.py`
- `ai-service/app/nlp/intent_patterns.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/tests/chatbot_test_helpers.py`
- `ai-service/tests/test_chatbot_public_context.py`
- `ai-service/tests/test_chatbot_public_mode.py`
- `ai-service/tests/test_admin_agent_chatbot.py`
- `ai-service/tests/test_employee_agent_chatbot.py`
- `ai-service/tests/test_manager_agent_chatbot.py`
- `ai-service/tests/test_meeting_planning_intents.py`
- `ai-service/tests/test_multilingual_chatbot_routing.py`
- `ai-service/tests/test_pointage_intents.py`
- `ai-service/tests/test_provider_usage_chatbot.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`
- `ai-service/tests/test_rh_agent_chatbot.py`
- `ai-service/tests/test_slot_filling_followups.py`
- `ai-service/tests/test_stt_multilingual_chatbot.py`
- `ai-service/tests/test_tts_chatbot.py`
- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`

## 19. Commit hash

Pending before commit. The final assistant response records the produced commit hash after `git commit` succeeds.
