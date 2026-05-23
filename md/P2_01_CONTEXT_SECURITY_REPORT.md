# P2-01 Context Security Report

Date: 2026-05-13
Project: WeenTime AI service
Scope: AI ContextBuilder JWT verification hardening

## Files changed

- `ai-service/app/context/jwt_parser.py`
- `ai-service/app/context/context_builder.py`
- `ai-service/app/context/permissions.py`
- `ai-service/tests/jwt_test_utils.py`
- `ai-service/tests/test_jwt_verification.py`
- `ai-service/tests/test_context_builder.py`
- `ai-service/tests/test_chat_v2.py`
- `ai-service/tests/test_voice_v2.py`
- `P2_01_CONTEXT_SECURITY_REPORT.md`

## Verification approach

The AI service now verifies JWTs before building a v2 runtime user context.

Implemented behavior:

- Authorization is extracted from the `Authorization: Bearer ...` header.
- JWT format must contain three segments in strict mode.
- HMAC JWT signatures are verified with stdlib `hmac` / `hashlib` for `HS256`, `HS384`, and `HS512`.
- Signing secret can be supplied directly to `ContextBuilder` or through environment variables:
  - `JWT_SECRET`
  - `AI_JWT_SECRET`
  - `JWT_VERIFICATION_SECRET`
  - `AI_JWT_VERIFICATION_SECRET`
- `exp` and `nbf` temporal claims are validated with a small clock leeway.
- Invalid signature, missing verification secret, expired token, malformed token, or unsupported algorithm fail with controlled context errors.
- Raw JWTs and Authorization headers are not logged.

## Strict and dev behavior

Runtime default is strict:

- unsigned or malformed JWTs are rejected.
- missing JWT verification secret is rejected.
- frontend-provided `user_id`, role, tenant, or permissions are not trusted.

Explicit dev/test compatibility exists only through:

- `allow_unverified_tokens=True` when constructing `ContextBuilder`, or
- `AI_JWT_ALLOW_UNVERIFIED=true` in the environment.

This compatibility path is explicit and covered by tests; it is not silent runtime trust.

## Backend profile canonical behavior

When a backend client is available, `ContextBuilder` calls:

- `GET /users/me`

The backend profile is treated as canonical for role and tenant when reachable.

Validation rules:

- backend profile user id must match the verified token user id.
- backend role must match the verified token role or be present in the verified token role set.
- backend tenant must match the verified token tenant when both are present.
- backend profile role and tenant populate the final context when valid.
- backend profile mismatch fails safely with controlled 403-style context errors.

If `/users/me` is unavailable, the context still validates the verified JWT claims and records `backend_profile_unavailable` as a warning.

## One-role handling

Business roles remain restricted to:

- `ADMIN`
- `RH`
- `MANAGER`
- `EMPLOYEE`

The one-user-one-role rule is now enforced in context construction:

- a canonical single role is accepted from `role` or a single normalized role value.
- multiple roles without a backend canonical single role are rejected.
- backend profiles containing multiple roles without a canonical role are rejected.
- unknown or unsupported roles are rejected.
- `permissions_for_role()` no longer defaults an empty role to employee permissions.

## Tenant handling

Tenant rules now fail safely:

- non-admin users must have `entreprise_id` / tenant context.
- tenantless admin is accepted by default because the product allows platform-level admin behavior.
- tenantless admin can be disabled through `allow_tenantless_admin=False`.
- backend/JWT tenant mismatch is rejected.

## Tests added or updated

Added:

- `ai-service/tests/jwt_test_utils.py`
- `ai-service/tests/test_jwt_verification.py`

Updated:

- `ai-service/tests/test_context_builder.py`
- `ai-service/tests/test_chat_v2.py`
- `ai-service/tests/test_voice_v2.py`

Coverage added:

- valid signed token builds context.
- invalid signature is rejected.
- unsigned token is rejected in strict mode.
- explicit unverified compatibility still works for tests/dev.
- missing verification secret is not silently accepted.
- expired token is rejected.
- payload `user_id` mismatch is rejected.
- backend `/users/me` user mismatch is rejected.
- backend role mismatch is rejected.
- backend tenant mismatch is rejected.
- multiple roles are rejected unless backend provides a canonical single role.
- tenantless admin is accepted.
- non-admin without tenant is rejected.
- `/v2/chat` and `/v2/voice` fixtures continue to work with valid signed context.

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: `ok`

```powershell
python -m pytest tests/test_context_builder.py tests/test_chat_v2.py tests/test_voice_v2.py -v
```

Result: `20 passed, 1 warning`

```powershell
python -m pytest tests/test_jwt_verification.py -v
```

Result: `6 passed`

```powershell
python -m pytest tests/test_context_builder.py tests/test_chat_v2.py tests/test_voice_v2.py tests/test_jwt_verification.py -v
```

Result: `26 passed, 1 warning`

Warning observed:

- `voice/stt.py` imports Python `audioop`, which is deprecated and scheduled for removal in Python 3.13. This is unrelated to P2-01.

## Remaining risks

- AI JWT verification currently supports HMAC algorithms because the Spring backend uses shared-secret JJWT signing. If backend moves to RSA/JWKS, AI service must add JWKS verification.
- Runtime deployments must provide the same JWT verification secret to AI service through environment/config management.
- If backend `/users/me` is down, AI falls back to verified JWT claims with a warning. This keeps availability but means canonical backend profile validation depends on backend reachability.
- Existing unrelated dirty worktree files remain outside this task and were not staged.

## Exact files staged for P2-01

Planned staged files:

- `ai-service/app/context/jwt_parser.py`
- `ai-service/app/context/context_builder.py`
- `ai-service/app/context/permissions.py`
- `ai-service/tests/jwt_test_utils.py`
- `ai-service/tests/test_jwt_verification.py`
- `ai-service/tests/test_context_builder.py`
- `ai-service/tests/test_chat_v2.py`
- `ai-service/tests/test_voice_v2.py`
- `P2_01_CONTEXT_SECURITY_REPORT.md`

## Commit

Commit message:

```text
fix(ai): verify authenticated user context
```

Commit hash: recorded after commit in the final task response.
