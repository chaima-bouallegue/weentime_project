# AI-05 RH Agent Stabilization Report

## Files changed
- `app/agents/rh_agent.py`
- `app/agents/router_agent.py`
- `app/agents/routing_priority.py`
- `app/nlp/normalization.py`
- `tests/test_rh_agent_chatbot.py`
- `AI_05_RH_AGENT_REPORT.md`

## Root cause
RH chatbot prompts still leaked into generic routes after AI-02/AI-04:
- RH document workload and document generation prompts were captured by the generic employee `DocumentAgent`.
- RH global presence prompts such as "Qui n'a pas pointe ?" and "Retards aujourd'hui" were not consistently recognized as RH/company presence.
- RH organization assignment prompts had no verified modern backend tool and could fall through to fallback.
- Unsupported RH modules such as contracts, recruitment/training, predictive risk, and e-signature could route to unrelated document/insight paths instead of a clean `capability_unavailable` contract.
- The Arabic/Tunisian backlog phrase needed normalization to route to the modern RH backlog path.

## RH behavior implemented
- RH backlog and pending validations now route to `RHAgent` and aggregate modern read tools:
  - `leave.list_rh_pending`
  - `telework.list_rh_pending`
  - `authorization.list_rh_requests`
  - `document.rh_workload`
- RH stats and absenteeism prompts route to `rh.get_stats`.
- RH document workload prompts route to `document.rh_workload` before generic document handling.
- RH/company presence prompts route to `get_team_presence`, which resolves to the RH company presence backend path through ToolRegistry.
- RH personal pointage prompts still route to personal `AttendanceAgent` status via `get_pointage_status`.
- RH user creation returns the existing admin-reserved capability response.
- RH organization assignment prompts return a clean `capability_unavailable` response because no verified RH assignment tool exists yet.
- RH document generation prompts use `document.rh_generate` only when enough employee identity is provided; otherwise the agent asks for employee name without creating a confirmation.
- Unsupported RH modules now return `capability_unavailable`:
  - contracts
  - recruitment/training
  - predictive risk
  - electronic signature

## Multilingual support
- FR/EN/TN backlog and pending validation prompts are covered.
- Arabic/Tunisian phrase `شنوة الطلبات المستنية؟` is normalized to the RH backlog path.
- TN user creation (`nheb nzid user jdid`) returns the RH/admin scope message.
- RH personal pointage TN (`pointit ou nn`) remains personal attendance.

## Security and authority guarantees
- ToolRegistry remains the authority for tool permissions.
- No write action executes directly from chatbot text.
- `document.rh_generate` returns a confirmation, not execution.
- Missing RH backend capability returns `capability_unavailable`, not fake data.
- No backend endpoint was invented.
- No JWT/public context, Ollama, STT/TTS, Redis, or frontend behavior was changed.

## Tests added/updated
- Expanded `tests/test_rh_agent_chatbot.py` with coverage for:
  - RH backlog FR/EN/TN/AR
  - pending validations
  - RH stats and absenteeism
  - RH document workload
  - RH/global presence
  - RH personal pointage vs RH global presence
  - RH create user capability message
  - RH organization assignment unavailable
  - RH document generation ask/confirmation
  - unsupported contracts/recruitment/training/predictive/signature features

## Validation results
- `python -c "import main; print('ok')"`: passed
  - Warning remains: optional router `app.api.document_generation` is unavailable.
- `python -m pytest tests/test_rh_agent_chatbot.py tests/test_rh_tools.py tests/test_role_copilots.py tests/test_pointage_intents.py -v`: passed, 51 tests.
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py tests/test_multilingual_chatbot_routing.py -v`: passed, 51 tests.

## Remaining limitations
- RH organization assignment remains unavailable because no verified RH assignment tool/backend endpoint was found.
- RH contract workflows remain unavailable.
- Recruitment/training, predictive risk, and e-signature remain future backend/tool work.
- RH document generation currently requires at least first and last employee name in the prompt; richer employee lookup is not implemented in this task.

## Exact files staged
- `ai-service/app/agents/rh_agent.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/tests/test_rh_agent_chatbot.py`
- `ai-service/AI_05_RH_AGENT_REPORT.md`

## Commit hash
- Pending until `git commit -m "fix(ai): stabilize rh chatbot agent"` is created. The final commit hash is recorded in the task completion response.
