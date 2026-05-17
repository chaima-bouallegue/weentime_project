# AI-02.5 Response Guard Contract Report

## Files changed
- `ai-service/app/core/response_types.py`
- `ai-service/app/guards/contracts.py`
- `ai-service/app/guards/validators.py`
- `ai-service/app/guards/rules.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`
- `ai-service/tests/test_capability_unavailable.py`
- `ai-service/tests/test_role_digests.py`

## Contracts added
Added explicit safe chatbot response contracts:
- `read_result`
- `digest`
- `no_data`
- `capability_unavailable`
- `planning_unavailable`
- `role_summary`
- `system_status`
- `citation_result`
- `approval_confirmation`
- `tool_safe_summary`

The guard now centralizes contract allowlists in `app/guards/contracts.py` and uses `app/guards/validators.py` to detect safe structured response contracts and nested read-result evidence.

## Examples fixed
Safe chatbot outputs now pass without fallback substitution when they carry structured evidence:
- pointage status read result
- employee/manager/RH/admin digests
- no-data meeting or pending-approval responses
- planning / meeting capability unavailable responses
- admin system/provider/Redis/RAG status contracts
- approval confirmation contracts
- policy citation responses
- deterministic tool-safe summaries

## Rejections preserved
The guard still rejects:
- fake leave balances without tool evidence
- fake attendance status without tool evidence
- fake user creation success without tool evidence
- fake system health/status without tool evidence
- raw SQL claims or database instructions
- secret/JWT/API key leakage
- unsupported tool execution claims
- unsupported backend status values
- policy answers without citations

## Tests added
- Expanded `tests/test_response_guard_chatbot_outputs.py` for pass/fail chatbot contracts.
- Added `tests/test_capability_unavailable.py` for unavailable/no-data contract cards.
- Added `tests/test_role_digests.py` for digest and role-summary contracts.

## Validation results
- `python -c "import main; print('ok')"` passed with the existing optional-router warning for `app.api.document_generation`.
- `python -m pytest tests/test_response_guard_chatbot_outputs.py tests/test_capability_unavailable.py tests/test_role_digests.py -v` passed: 20 passed.
- `python -m pytest tests/test_chat_v2.py tests/test_multilingual_chatbot_routing.py -v` passed: 29 passed, 1 warning.
- Additional guard regression run: `python -m pytest tests/test_response_guard.py tests/test_response_guard_allowlist.py tests/test_response_guard_role_outputs.py -v` passed: 43 passed.

## Exact staged files
- `AI_02_5_RESPONSE_GUARD_REPORT.md`
- `ai-service/app/core/response_types.py`
- `ai-service/app/guards/contracts.py`
- `ai-service/app/guards/validators.py`
- `ai-service/app/guards/rules.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`
- `ai-service/tests/test_capability_unavailable.py`
- `ai-service/tests/test_role_digests.py`

## Commit hash
Pending at report creation time. The final assistant response records the actual commit hash after commit.
