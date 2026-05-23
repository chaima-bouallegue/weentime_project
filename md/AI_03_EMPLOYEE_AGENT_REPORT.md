# AI-03 Employee Agent Stabilization Report

## Files changed

- `app/nlp/normalization.py`
- `app/nlp/language_detector.py`
- `app/nlp/intent_patterns.py`
- `app/agents/routing_priority.py`
- `app/agents/attendance_agent.py`
- `app/agents/reunion_agent.py`
- `tests/test_employee_agent_chatbot.py`
- `tests/test_pointage_intents.py`
- `tests/test_slot_filling_followups.py`
- `tests/test_multilingual_chatbot_routing.py`
- `tests/test_meeting_planning_intents.py`
- `AI_03_EMPLOYEE_AGENT_REPORT.md`

## Root cause

Employee chatbot routing was mostly centralized in AI-02, but several FR/EN/AR/TN employee phrases still diverged before agent selection because shared normalization, language hints, and deterministic routing markers were incomplete.

Main failures addressed:

- Tunisian pointage phrases such as `pointit ou nn`, `rani jit`, and `rani khrajt` were not normalized consistently.
- Arabic attendance, telework, document, leave-balance, meeting, and daily-summary prompts lacked enough direct normalization coverage.
- Tunisian document and meeting phrases such as `war9a khidma` and `fama reunion` could reach fallback or an unknown meeting response.
- Policy-style questions containing `absence` could be routed as leave list/status instead of policy/RAG.

## Employee behavior stabilized

- Pointage status now routes to `AttendanceAgent` personal status for FR/EN/AR/TN equivalents.
- Forgotten checkout stays a read-only attendance check and does not execute checkout.
- TN arrival/departure phrases create confirmation-only `check_in` / `check_out` responses.
- Daily summary prompts in FR/EN/AR/TN route to employee role intelligence.
- Leave balance and leave creation prompts route to `LeaveAgent` without fake data.
- Telework prompts route to the existing telework slot-filling/confirmation flow.
- Document requests route to `DocumentAgent`; work-certificate phrases infer the document type.
- Planning prompts return `planning.unavailable` where no planning tool exists.
- Meeting prompts route to `ReunionAgent` read tools where available.
- Policy questions route to policy/RAG and return unavailable when no approved source/citation is available.

## Multilingual normalization

Added or extended deterministic normalization for:

- TN pointage: `pointit ou nn`, `rani jit`, `rani khrajt`.
- TN relative/request terms: `9adech`, `mazeli`, `famma/fama`, `aandi`, `chnowa`, `chkoun`.
- TN domains: `nkhdem remote`, `war9a khidma`, `repos`.
- AR attendance: attendance-status and forgot-checkout questions.
- AR leave: leave-balance vocabulary and leave terms after Arabic character normalization.
- AR telework/document/meeting/digest prompts.

## Safety guarantees preserved

- JWT/public context behavior was not changed.
- ToolRegistry remains the only execution path for backend tools.
- Write actions still return confirmations and are not executed directly.
- No backend data is fabricated.
- Unsupported planning returns capability-unavailable style output instead of unsafe fallback.
- ResponseGuard contracts were not changed in this task.
- Ollama/provider behavior was not changed.

## Tests added/updated

- Added multilingual employee route coverage in `tests/test_employee_agent_chatbot.py`.
- Added multilingual pointage status/action/forgot-checkout coverage in `tests/test_pointage_intents.py`.
- Added TN telework follow-up slot-filling coverage in `tests/test_slot_filling_followups.py`.
- Expanded central multilingual routing coverage in `tests/test_multilingual_chatbot_routing.py`.
- Added AR/TN meeting route coverage in `tests/test_meeting_planning_intents.py`.

## Validation results

- `python -c "import main; print('ok')"` passed.
  - Existing warning remains: optional router `app.api.document_generation` is unavailable.
- `python -m pytest tests/test_employee_agent_chatbot.py tests/test_employee_intelligence.py tests/test_slot_filling_followups.py tests/test_pointage_intents.py -v` passed: 26 passed.
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py tests/test_multilingual_chatbot_routing.py -v` passed: 51 passed, 1 voice `audioop` deprecation warning.
- Extra regression because meeting code was touched: `python -m pytest tests/test_meeting_planning_intents.py -v` passed: 7 passed.
- `git diff --check` passed with only existing CRLF normalization warnings.

## Remaining limitations

- `npointi` remains a check-in confirmation path for compatibility with existing intent tests; `pointit ou nn` is the explicit TN personal-status question.
- Policy answers require approved sources/citations; when no approved source is available, the employee receives an unavailable policy answer, not fabricated guidance.
- Planning remains unavailable because no safe planning read tool is wired for this task.
- Meeting reads depend on the existing reunion backend/tool availability.
- A committed report cannot contain the final hash of the same commit; the exact commit hash is recorded in the final response after commit.

## Exact files staged

Planned AI-03 staged files:

- `ai-service/app/agents/attendance_agent.py`
- `ai-service/app/agents/reunion_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/nlp/intent_patterns.py`
- `ai-service/app/nlp/language_detector.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/tests/test_employee_agent_chatbot.py`
- `ai-service/tests/test_meeting_planning_intents.py`
- `ai-service/tests/test_multilingual_chatbot_routing.py`
- `ai-service/tests/test_pointage_intents.py`
- `ai-service/tests/test_slot_filling_followups.py`
- `ai-service/AI_03_EMPLOYEE_AGENT_REPORT.md`

## Commit hash

Recorded after commit in the final task response.
