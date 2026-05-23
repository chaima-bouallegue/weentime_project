# AI-04 Compatibility Stabilization Report

## Root Causes

- Legacy compatibility calls in `process_copilot_message()` constructed an ad-hoc `Claims` object that did not include the new canonical `verified` field expected by `ContextBuilder._from_claims()`.
- Several compatibility endpoint tests still generated placeholder unsigned JWT strings (`header.payload.signature`) after strict JWT verification was introduced.
- Some v2 endpoint tests did not install a strict test `ContextBuilder` with the signed test JWT secret, so `/v2/chat`, `/v2/chat/confirm`, and `/v2/voice` correctly returned 401.
- Request-correlation test setup installed a strict test `ContextBuilder`, then immediately deleted it during state reset.
- ResponseGuard treated pending confirmation prompts as if they were executed business status/tool claims, which incorrectly rejected valid slot-filled `confirm_action` responses.
- A mocked voice status answer claimed attendance state without authoritative tool evidence, so ResponseGuard correctly rewrote it to deterministic fallback.

## Fixes Applied

- Converted the no-token legacy compatibility path in `app/core/copilot_engine.py` to use canonical `JwtClaims(verified=False, ...)` instead of a dynamic object.
- Preserved strict runtime security: compatibility without token still requires explicit `metadata.allow_legacy_without_token` and remains non-authoritative/test-only.
- Added optional compatibility tenant metadata propagation for legacy tests through `metadata.entreprise_id` / `metadata.tenant_id`.
- Updated affected tests to use signed `jwt_test_utils.make_token()` tokens and strict `ContextBuilder(..., jwt_secret=TEST_JWT_SECRET)` setup.
- Fixed request-correlation state reset so it no longer deletes the configured strict test `ContextBuilder`.
- Updated confirmation error handling so backend 403/404/5xx failures return controlled, user-facing messages instead of raw backend strings.
- Adjusted ResponseGuard rules so pending `confirm_action` prompts are not rejected by post-execution tool/status rules.
- Updated voice contract mock data to include authoritative action evidence when asserting attendance-status text aliases.

## Compatibility Strategy

- Runtime JWT verification remains strict by default.
- Unsigned runtime tokens are still rejected unless explicit verifier compatibility flags are used in lower-level JWT parser tests.
- The legacy no-token path is opt-in via metadata and does not become a general auth bypass.
- Endpoint contract tests now use realistic signed JWTs rather than weakening the app verifier.
- Confirmation, voice, and request ID envelopes remain stable for clients while preserving verified user context.

## Files Modified

- `app/core/copilot_engine.py`
- `app/api/chat_v2.py`
- `app/guards/rules.py`
- `tests/test_confirmation_error_handling.py`
- `tests/test_request_correlation.py`
- `tests/test_slot_filling_flows.py`
- `tests/test_voice_contract.py`

## Tests Fixed

Previously failing groups are now green:

- `tests/test_confirmation_error_handling.py`
- `tests/test_request_correlation.py`
- `tests/test_slot_filling_flows.py`
- `tests/test_voice_contract.py`

## Validation Results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

- `python -c "import main; print('ok')"`
  - Result: `ok`
- `python -m pytest tests/test_confirmation_error_handling.py -v`
  - Result: `3 passed`
- `python -m pytest tests/test_request_correlation.py -v`
  - Result: `3 passed`
- `python -m pytest tests/test_slot_filling_flows.py -v`
  - Result: `5 passed`
- `python -m pytest tests/test_voice_contract.py -v`
  - Result: `4 passed`
- `python -m pytest tests/test_confirmation_error_handling.py tests/test_request_correlation.py tests/test_slot_filling_flows.py tests/test_voice_contract.py tests/test_response_guard.py -v`
  - Result: `28 passed`
- `python -m pytest tests -v`
  - Result: `370 passed, 7 warnings`

## Security Guarantees Preserved

- Strict JWT verification remains active for v2 runtime endpoints.
- Frontend `user_id`, role, tenant, and permissions are still not trusted as authority.
- Backend profile and verified JWT context remain canonical.
- ToolRegistry and ToolExecutor enforcement were not weakened.
- Write actions still require confirmation.
- ResponseGuard still blocks fake HR values, unsupported execution claims, secret leaks, and unsupported statuses after execution.
- Confirmation prompts are allowed only as pending prompts; they do not claim execution success.

## Remaining Limitations

- `AI_HYBRID_ARCHITECTURE_AUDIT.md` was requested as reading material but is missing from this checkout.
- The worktree contains unrelated dirty files outside AI-04 scope; they were not modified for this task and must remain unstaged.
- The legacy no-token compatibility path remains intentionally test/legacy-only and should not be used for production v2 endpoints.

## Exact Files Staged

Planned targeted staging only:

- `AI_04_COMPATIBILITY_STABILIZATION_REPORT.md`
- `app/core/copilot_engine.py`
- `app/api/chat_v2.py`
- `app/guards/rules.py`
- `tests/test_confirmation_error_handling.py`
- `tests/test_request_correlation.py`
- `tests/test_slot_filling_flows.py`
- `tests/test_voice_contract.py`

## Final Pytest Summary

`370 passed, 7 warnings in 71.68s`.

## Commit Hash

Pending commit: `fix(ai): stabilize verified context compatibility`
