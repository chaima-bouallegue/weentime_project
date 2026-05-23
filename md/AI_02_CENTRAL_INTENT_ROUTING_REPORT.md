# AI-02 Central Intent Routing Report

## Files changed
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/tests/test_multilingual_chatbot_routing.py`
- `ai-service/tests/test_meeting_planning_intents.py`
- `ai-service/tests/test_role_routing.py`

## Routing priority implemented
Added `CENTRAL_ROUTING_PRIORITY` and `choose_priority_route()` as a deterministic first-pass router before legacy scoring. The implemented order is:

1. greeting / small talk
2. role daily digest / briefing
3. pointage / attendance
4. forgotten checkout
5. meetings / planning
6. document
7. authorization info/list/create
8. telework
9. leave / absence
10. communication
11. policy / RAG
12. manager approvals
13. RH workflows
14. admin workflows
15. capability_unavailable
16. safe fallback

`RouterAgent` now calls this priority resolver after deterministic greetings and before role-action, explicit-domain, confidence scoring, and legacy fallback. ToolRegistry, ResponseGuard, and confirmations remain downstream authority.

## Examples fixed
- `je veux une demande de document` routes to `DocumentAgent`, not `LeaveAgent`.
- `est ce que jai pointé`, `Did I check in?`, and Arabic attendance status questions route to `AttendanceAgent` as `attendance.status`.
- `Show my daily summary` routes to `RoleIntelligenceAgent`.
- `Pending approvals` routes to `ManagerAgent` for MANAGER context.
- `RH backlog` routes to `RHAgent` for RH context.
- `System health` routes to `AdminAgent` for ADMIN context.
- `c quoi les autorisations dispo` routes to `authorization.info`, not `authorization.create`.
- `aandi meeting` and `my meetings` route to the Reunion/Planning handler.
- `Create meeting tomorrow` returns `capability_unavailable` instead of guard fallback.

## Capability unavailable behavior
Known unsupported features now get deterministic `AgentResponse` payloads with:
- `actionResult.kind = capability_unavailable`
- explicit capability id such as `meeting.create`
- no tool execution
- no confirmation unless a real write tool exists

This prevents unsupported prompts from falling into `fallback.guard_rejected` or `fallback.unsafe_response`.

## Tests added/updated
- Added multilingual document-vs-leave priority coverage.
- Added FR/EN/AR pointage status routing coverage.
- Added role daily summary priority coverage.
- Added authorization-info-not-create coverage.
- Added manager/RH/admin direct prompt routing coverage.
- Added Tunisian meeting prompt coverage.
- Added unsupported meeting creation capability-unavailable coverage.
- Added unit-level priority-order and resolver tests.

## Validation results
- `python -c "import main; print('ok')"` passed with existing optional-router warning for `app.api.document_generation`.
- `python -m pytest tests/test_multilingual_chatbot_routing.py tests/test_pointage_intents.py tests/test_meeting_planning_intents.py tests/test_role_routing.py -v` passed: 44 passed, 4 warnings.
- `python -m pytest tests/test_response_guard_chatbot_outputs.py tests/test_chat_v2.py -v` passed: 8 passed, 1 warning.

## Exact staged files
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/tests/test_multilingual_chatbot_routing.py`
- `ai-service/tests/test_meeting_planning_intents.py`
- `ai-service/tests/test_role_routing.py`
- `AI_02_CENTRAL_INTENT_ROUTING_REPORT.md`

## Commit hash
Pending at report creation time. The final assistant response records the actual commit hash after commit.
