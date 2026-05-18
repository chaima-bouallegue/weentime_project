# RH_HYBRID_AGENT_01_REPORT

Date: 2026-05-18

## MCP tools used

- filesystem MCP: inspected AI agents, routing, NLP, tools, workflows, reports, frontend chat metadata, Angular routes, and backend controllers.
- Playwright MCP: validated local Angular routing boundary. Dev server initially refused connection; after starting Angular dev server, guarded RH routes redirected to login/landing as expected without console warnings.
- postgres MCP: not used; endpoint/tool inspection was sufficient and no database data was required.
- redis/docker MCP: not used.

## Files inspected

- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/agents/attendance_agent.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/app/nlp/intent_patterns.py`
- `ai-service/app/tools/*`
- `ai-service/app/workflows/*`
- `ai-service/app/core/*`
- `ai-service/app/providers/*`
- `ai-service/app/policy/*`
- `ai-service/tests/*`
- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`
- `weentime-frontend/angular-weentime/src/app/features/shell/shell.routes.ts`
- Spring controllers under organisation-service, rh-service, presence-service, and communication-service.

Requested pasted files `Pasted text(114).txt` and `Pasted text (2)(7).txt` were not found in the project tree.

## Backend endpoints/tools discovered

Detailed endpoint map is in `BACKEND_AI_MAP.md`.

Key RH-relevant verified endpoints/tools:

- Departments: `/api/v1/organisations/departements`, ToolRegistry `organisation.list_departments`, `organisation.create_department`.
- Teams: `/api/v1/organisations/equipes`, ToolRegistry `organisation.list_teams`, `organisation.create_team`.
- Presence: `/api/v1/presence/me/today`, `/me/check-in`, `/me/check-out`, `/team/today`, `/company/today`, `/global/analytics`, ToolRegistry attendance tools.
- Schedules: `/api/v1/horaires`, new read-only ToolRegistry tool `schedule.list`.
- Leave: `/api/v1/rh/conges/*`, ToolRegistry leave manager/RH tools.
- Telework: `/api/v1/rh/teletravail/*`, ToolRegistry telework manager/RH tools.
- Authorizations: `/api/v1/rh/autorisations/*`, ToolRegistry authorization tools.
- Documents: `/api/v1/documents/*`, ToolRegistry document request/RH workload/generation tools.
- RH stats: `/api/v1/rh/stats`, ToolRegistry `rh.get_stats`.
- Communication: `/api/v1/communication/*`, ToolRegistry communication tools.

## Frontend current_page metadata changes

Detailed frontend map is in `FRONTEND_CONTEXT_MAP.md`.

- Existing frontend metadata already sends both `current_page` and `currentPage` for text and voice requests.
- AI service accepts both metadata spellings.
- RH page contexts now include Angular's real French route `/app/rh/structure/departements` plus the requested English alias `/app/rh/structure/departments`.
- Voice/text metadata uses session/conversation context so current-page continuity and slot filling stay role/page-aware.

## Hybrid router design

Implemented deterministic-first RH routing:

1. Detect language using existing language detector.
2. Normalize FR/EN/AR/TN text with shared normalization.
3. Resolve role and `current_page` context.
4. Run deterministic RH classifier.
5. If deterministic confidence is high, route directly to the target agent.
6. If ambiguous, ask for missing slots instead of executing.
7. LLM classifier helper exists for JSON-only fallback classification, but it does not answer the user and does not execute tools.
8. ToolRegistry or RAG handles authority.
9. ResponseGuard remains final safety boundary.

New modules:

- `app/agents/page_context.py`: RH page context map.
- `app/agents/hybrid_intent_router.py`: deterministic multilingual RH classifier.
- `app/agents/llm_intent_classifier.py`: JSON-only LLM classifier parser/wrapper.
- `app/intents/rh_intents.json`: documented RH intent inventory and authority rules.

## LLM classifier usage

- The LLM classifier is available only as a classifier helper for ambiguous prompts.
- It requires JSON shape: `intent`, `confidence`, `entities`, `missing`, `reason`.
- Parser rejects non-JSON/freeform answers.
- It cannot execute tools, approve/refuse/create, or answer users directly.
- Current tests cover parser acceptance/rejection and deterministic-first routing.

## RH intents added

Implemented routing coverage for:

- Structure: department create/list/update/delete, team create/list/members, employee/team assignment, manager assignment/show.
- Leave: list, pending, approve, reject, rejected/urgent variants.
- Telework: list, pending, approve, reject.
- Authorization: list, urgent, approve, reject.
- Attendance: self status/check-in/check-out/clarify, RH today/missing/absent/late/sync/manual fix.
- Schedules: list, create clarification, assign clarification.
- Documents: list/workload, urgent, generate.
- Analytics: RH stats summary.
- Messages: list/read/summarize/send routing markers.
- Policy: RH policy question routing to policy/RAG path.
- Future modules: recruitment, training, predictive, signature, contracts return capability unavailable unless a verified backend tool exists.

## Multilingual dataset coverage

Added tests for every required TN/FR/AR/EN dataset row:

- Department create/list/delete/update.
- Team create/list/members.
- Employee/team assignment.
- Employee/manager creation intent classification.
- Manager assignment/show.
- Leave list/pending/approve/reject.
- Telework list/approve.
- Authorization list/approve.
- Attendance missing/today/sync/manual fix/absent.
- Schedules list/create/assign.
- Documents generate/urgent.
- RH analytics summary.
- RH backlog.
- Ambiguous prompts ask clarification.

## Attendance protection fix

- RH structure/schedule/document/leave prompts no longer route to `attendance.check_out`.
- RH self check-in/check-out is allowed only for explicit personal pointage phrases such as `npointi`, `rani jit`, `rani khrajt`, `check in`, `check out`, `pointer mon entree`, or `pointer ma sortie`.
- `pointe sortie` reads `attendance.status` first.
- If no entry exists today, the response is `no_data`: `Aucun pointage d'entree detecte aujourd'hui.`
- Checkout confirmation is created only if status shows an active/open entry.

## No fake data guarantees

- Live data still comes from Spring backend through ToolRegistry.
- Schedule reads use `schedule.list` -> `/horaires`.
- RH backlog uses modern leave/telework/authorization/document reads.
- RH stats use `rh.get_stats`.
- Policy questions route to RAG only for policy/FAQ and still require citations.
- Missing write tools return clarification or `capability_unavailable`.
- LLM classifier and wording paths do not execute tools or claim backend success.

## Tests added/updated

- `ai-service/tests/test_rh_hybrid_router.py`
- `ai-service/tests/test_rh_page_context.py`
- `ai-service/tests/test_rh_multilingual_intents.py`
- `ai-service/tests/test_rh_attendance_protection.py`
- `ai-service/tests/test_rh_tool_authority.py`
- Updated `ai-service/tests/test_rh_agent_chatbot.py` compatibility via implementation, not test weakening.
- Prior session/page continuity tests remain green: `test_voice_continuity.py`, `test_multilingual_memory.py`, `test_slot_filling_followups.py`.

## Playwright validation

- `http://127.0.0.1:4200` initially refused connection.
- Started Angular dev server with `npm start -- --host 127.0.0.1 --port 4200`.
- `/app/rh/structure/departments` redirected to landing `/` because Angular's real route is `/app/rh/structure/departements` and auth guard is active.
- `/app/rh/horaires` redirected to `/login`.
- `/app/rh/pointage` redirected to `/login`.
- Console warnings/errors during these navigations: none.
- Full RH widget prompt execution in browser requires authenticated RH session plus backend/gateway/AI services running.

## Validation results

- `python -c "import main; print('ok')"`: passed. Existing optional-router warning remains for missing `app.api.document_generation`.
- `python -m pytest tests/test_rh_hybrid_router.py tests/test_rh_page_context.py tests/test_rh_multilingual_intents.py tests/test_rh_attendance_protection.py tests/test_rh_tool_authority.py -v`: 57 passed.
- `python -m pytest tests/test_rh_agent_chatbot.py tests/test_chat_v2.py tests/test_voice_v2.py tests/test_response_guard_chatbot_outputs.py -v`: 53 passed, 1 deprecation warning from `audioop`.
- `python -m pytest tests/test_slot_filling_followups.py tests/test_voice_continuity.py tests/test_multilingual_memory.py tests/test_rh_page_context.py -v`: 25 passed.
- `python -m pytest tests/test_chat_v2.py tests/test_multilingual_chatbot_routing.py -v`: 38 passed, 1 deprecation warning from `audioop`.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `npm run build`: passed with pre-existing Angular budget/CommonJS warnings.

## Remaining limitations

- Full Playwright RH chatbot validation is blocked without authenticated seeded RH session and running backend/gateway/AI stack.
- Schedule create/assign write tools were not added; prompts ask for details instead of executing.
- RH organization assignment remains unavailable unless a verified ToolRegistry write tool is added.
- RH team members/manager show are classified, but no dedicated ToolRegistry read tool was added in this task.
- Optional API router warning for `app.api.document_generation` remains from previous architecture.
- `Pasted text(114).txt` and `Pasted text (2)(7).txt` were unavailable.

## Exact staged files

Intended staged files for this commit:

- `CLEANUP_REPORT.md`
- `BACKEND_AI_MAP.md`
- `FRONTEND_CONTEXT_MAP.md`
- `RH_HYBRID_AGENT_01_REPORT.md`
- `ai-service/app/agents/attendance_agent.py`
- `ai-service/app/agents/hybrid_intent_router.py`
- `ai-service/app/agents/llm_intent_classifier.py`
- `ai-service/app/agents/page_context.py`
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/api/chat_v2.py`
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/context/anonymous_context.py`
- `ai-service/app/core/conversation_state.py`
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/core/slot_filling.py`
- `ai-service/app/intents/rh_intents.json`
- `ai-service/app/nlp/normalization.py`
- `ai-service/app/tools/schedule_tools.py`
- `ai-service/app/workflows/session_serializer.py`
- `ai-service/app/workflows/session_state.py`
- `ai-service/app/workflows/session_store.py`
- `ai-service/app/workflows/workflow_orchestrator.py`
- `ai-service/app/workflows/workflow_steps.py`
- `ai-service/tests/chatbot_test_helpers.py`
- `ai-service/tests/test_multilingual_memory.py`
- `ai-service/tests/test_rh_attendance_protection.py`
- `ai-service/tests/test_rh_hybrid_router.py`
- `ai-service/tests/test_rh_multilingual_intents.py`
- `ai-service/tests/test_rh_page_context.py`
- `ai-service/tests/test_rh_tool_authority.py`
- `ai-service/tests/test_voice_continuity.py`
- `weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.ts`
- `weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts`

Excluded from staging:

- `ai-service.zip`
- `ai-service/WEENTIME_FULL_AUDIT_REPORT.md`

## Commit hash

Pending until commit creation. Final commit hash is reported in the final response after `git commit` succeeds.
