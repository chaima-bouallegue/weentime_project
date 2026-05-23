# AI-04 Manager Agent Stabilization Report

## Files changed

- `app/agents/attendance_agent.py`
- `app/agents/manager_agent.py`
- `app/agents/router_agent.py`
- `app/agents/routing_priority.py`
- `app/nlp/normalization.py`
- `tests/test_manager_agent_chatbot.py`
- `AI_04_MANAGER_AGENT_REPORT.md`

## Root cause

Manager chat routing had three narrow gaps after AI-03:

- Manager team pointage phrases could be treated as personal attendance status or remain unknown because the attendance detector did not recognize manager/team phrases such as `Qui n'a pas pointe`, `chkoun ma pointach`, or `Team attendance anomalies` as team-visible reads.
- Manager decision prompts containing leave vocabulary, such as `Approuve le conge 42`, could be routed to leave before `ManagerAgent` because manager decision verbs were evaluated too late in the central priority order.
- Unsupported manager features such as reports, team availability, and missions were not classified as explicit `capability_unavailable` responses.

## Manager behavior stabilized

- Personal manager pointage prompts still route to personal `attendance.status`.
- Team pointage/presence prompts route to `attendance.team_presence` and use the team presence read tool.
- Team presence backend failures return a clean unavailable read contract, not fallback.
- Pending approvals prompts in FR/EN/AR/TN route to `ManagerAgent` pending summary.
- Manager approve/refuse/accept prompts create confirmation-only responses.
- Natural employee-name approval, such as `Accepte la demande d'Ahmed`, resolves via manager-visible pending lists when possible.
- Ambiguous request IDs return choices/clarification instead of executing a write.
- Unsupported manager reports, meeting creation, availability, and mission prompts return `capability_unavailable`.
- Team summary prompts route to role intelligence manager digest.

## Multilingual coverage

Added deterministic support for:

- TN team pointage: `chkoun ma pointach` -> team presence intent for manager context.
- AR pending approvals: Arabic phrases for pending approvals normalize to `pending approvals`.
- FR manager decisions: `accepte` is handled as an approval verb.
- Team summary variants with curly apostrophe forms, for example `Today’s team summary`.

## Safety guarantees preserved

- Public chatbot/JWT context was not changed.
- ToolRegistry remains the only tool execution path.
- Manager write actions still require confirmation and are never executed directly by the agent.
- No fake team data, fake analytics, fake reports, or fake availability are generated.
- Unsupported features return explicit capability-unavailable responses.
- ResponseGuard contracts were not changed.
- Ollama/STT/TTS behavior was not changed.

## Tests added/updated

Updated `tests/test_manager_agent_chatbot.py` to cover:

- Manager personal pointage in FR/EN/TN variants.
- Manager team pointage/presence prompts.
- Team presence unavailable contract.
- Pending approvals in FR/EN/AR/TN variants.
- Approval/refusal confirmation behavior.
- Natural employee-name approval resolution.
- Unknown request ID clarification.
- Ambiguous request choices.
- Unsupported reports/meetings/availability/missions as capability unavailable.
- Manager team summary digest routing.

## Validation results

- `python -c "import main; print('ok')"` passed.
  - Existing optional-router warning remains for `app.api.document_generation`.
- `python -m pytest tests/test_manager_agent_chatbot.py tests/test_manager_copilot.py tests/test_manager_digest_builder.py tests/test_team_insight_engine.py tests/test_pointage_intents.py -v` passed: 51 passed.
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py tests/test_multilingual_chatbot_routing.py -v` passed: 51 passed, 1 voice `audioop` deprecation warning.
- `git diff --check` passed with only CRLF normalization warnings.

## Remaining limitations

- Advanced team analytics are not invented; unsupported analytics/report/mission prompts return capability unavailable unless a verified backend tool is later added.
- Team presence quality depends on the backend `get_team_presence` tool response.
- Natural employee-name approval only resolves when exactly one manager-visible pending request matches the employee name.
- A committed report cannot contain the final hash of the same commit; the exact commit hash is recorded in the final response after commit.

## Exact files staged

Planned AI-04 staged files:

- `ai-service/app/agents/attendance_agent.py`
- `ai-service/app/agents/manager_agent.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/tests/test_manager_agent_chatbot.py`
- `ai-service/AI_04_MANAGER_AGENT_REPORT.md`

## Commit hash

Recorded after commit in the final task response.
