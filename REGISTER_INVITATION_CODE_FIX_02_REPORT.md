# REGISTER_INVITATION_CODE_FIX_02_REPORT

## Summary
- Verified the public route is `GET /api/v1/organisations/entreprises/validate-code/{code}`. The gateway routes `/api/v1/organisations/**` to the organisation service and permits this validation path.
- Fixed the backend lookup so a displayed code such as `WEEN-C3F302B5E8CF` can match persisted variants such as `WEEN-C3F302B5E8CF`, `WEENC3F302B5E8CF`, or `C3F302B5E8CF`.
- Kept registration gated by active enterprises only. Closed enterprises still return `ENTERPRISE_CLOSED` and are not made registerable.
- Added frontend handling so register owns the message for validation failures and never shows a raw "ressource introuvable" message for invitation-code checks.

## Backend Changes
- `EntrepriseValidationDTO` now includes `invitationCode`.
- `EntrepriseServiceImpl` now normalizes invitation codes with trim, uppercase, whitespace removal, leading `#` removal, and the visual `#N - ...` case.
- Backend candidate lookup now includes canonical, compact, and suffix-only forms:
  - `WEEN-C3F302B5E8CF`
  - `WEENC3F302B5E8CF`
  - `C3F302B5E8CF`
- Repository lookup also removes spaces and `#` from stored values before comparing uppercase candidates.
- Structured responses remain:
  - active code: HTTP 200, `valid: true`, enterprise details, `status: ACTIVE`, `invitationCode`.
  - closed enterprise: HTTP 409, `valid: false`, `reason: ENTERPRISE_CLOSED`.
  - missing code: HTTP 404, `valid: false`, `reason: CODE_NOT_FOUND`.

## Frontend Changes
- `AuthService.validateCompanyCode()` sends the normalized code and sets `X-Skip-Error-Toast` so the global interceptor does not show a generic 404 toast.
- Register normalization now matches the backend: trim, uppercase, remove spaces, remove leading `#`, preserve hyphens, and convert `#N - C3F302B5E8CF` to `WEEN-C3F302B5E8CF`.
- The register page now maps missing backend reasons from HTTP status, so a 404 without `reason` still shows `Code d'invitation invalide ou expiré.`
- The frontend format gate was relaxed so `invalid-code` reaches the backend and receives `CODE_NOT_FOUND` instead of being blocked by a WEEN-only client regex.
- The typed code remains visible and the validation button stays disabled while validation is loading.

## Tests Added
- Backend unit coverage for:
  - active enterprise code validation.
  - closed enterprise rejection.
  - invalid code rejection.
  - lowercase and spaced code normalization.
  - suffix-only stored code matching a `WEEN-...` input.
  - visual `#N - ...` normalization.
- Frontend register spec coverage for:
  - valid active response moving to step 2.
  - `ENTERPRISE_CLOSED` message.
  - `CODE_NOT_FOUND` message.
  - no raw resource-not-found message.
  - visual-prefix normalization before API calls.

## Validation
- Backend: `.\mvnw.cmd test` in `weentime-backend/services/organisation-service` passed.
- Frontend: `npx tsc --noEmit -p tsconfig.app.json` passed.
- Frontend: `npm run build` passed with existing budget/CommonJS warnings.
- Frontend unit target: `npm test -- --watch=false` is blocked by unrelated existing spec compile errors:
  - `src/app/core/services/ai-copilot.service.spec.ts`
  - `src/app/features/manager/manager-api.service.spec.ts`
  - `src/app/shared/chat-widget/chat-widget.component.spec.ts`

## Manual Check
- `http://localhost:4200/register` was reachable.
- The live gateway at `http://localhost:8322` was reachable, but it was still running code/data that returned 404 for `WEEN-C3F302B5E8CF`, so an end-to-end active-code success could not be truthfully marked as passed without restarting/deploying the updated backend service.
- Against the running frontend, checked:
  - `WEEN-C3F302B5E8CF` kept the input visible and showed `Code d'invitation invalide ou expiré.` instead of a raw resource message.
  - `ween-c3f302b5e8cf` normalized to the same request as the uppercase code.
  - `WEEN C3F302B5E8CF` sent `WEENC3F302B5E8CF`, which the updated backend now resolves through candidate matching.
  - `invalid-code` reached the backend as `INVALID-CODE` and showed `Code d'invitation invalide ou expiré.`
- A read-only Postgres inspection could not be completed because the configured connector failed authentication.
