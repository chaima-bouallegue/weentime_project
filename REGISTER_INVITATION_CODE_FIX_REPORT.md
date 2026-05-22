# REGISTER-FIX-INVITATION-CODE-01

## Summary

Fixed registration invitation code validation so the backend distinguishes:

- active enterprise code: `200 OK` with `valid: true`
- existing closed enterprise code: `409 Conflict` with `reason: ENTERPRISE_CLOSED`
- unknown or expired code: `404 Not Found` with `reason: CODE_NOT_FOUND`

The frontend now maps those reasons to clear French messages and keeps the typed code visible.

## Backend

- Endpoint confirmed: `GET /api/v1/organisations/entreprises/validate-code/{code}` in `EntrepriseController`.
- Added structured `EntrepriseValidationDTO` fields: `valid`, `enterpriseId`, `enterpriseName`, `status`, `reason`, `message`.
- Normalized invitation codes with trim, uppercase, and whitespace removal.
- The lookup now checks whether a code exists before checking `estActive`, so closed enterprises no longer look like invalid codes.
- Registration in `UtilisateurServiceImpl.registerUtilisateur` now rejects inactive enterprises even if a caller submits an `entrepriseId` directly.
- Added test config for `integration.internal-api-key` so organisation-service context tests load in the test environment.

## Frontend

- `AuthService.validateCompanyCode` normalizes codes before calling the API.
- `RegisterComponent` accepts normalized formats including lowercase and spaces.
- Error mapping:
  - `CODE_NOT_FOUND`: `Code d'invitation invalide ou expiré.`
  - `ENTERPRISE_CLOSED`: `Cette entreprise est fermée. Contactez votre administrateur.`
  - network error: `Service indisponible. Réessayez plus tard.`
- The step 1 validate button remains disabled while validation is loading or failed.
- The input value is not overwritten, so the typed code stays visible.
- Console logging added only behind Angular `isDevMode()`.

## Tests

Added `EntrepriseServiceImplTest` covering:

- valid active code
- existing closed code
- invalid code
- lowercase code
- code with spaces

## Validation

- Frontend type-check: `npx tsc --noEmit -p tsconfig.app.json` passed.
- Frontend build: `npm run build` passed with existing bundle/CommonJS budget warnings.
- Organisation service: `.\mvnw.cmd test` passed, 7 tests.
- Auth service: `.\mvnw.cmd test` passed, 6 tests.

## Manual Check

- `http://localhost:4200/register` was reachable.
- `http://localhost:8322/api/v1/organisations/entreprises/validate-code/WEEN-1024` was not reachable in this environment (`Impossible de se connecter au serveur distant`), so live API cases could not be manually exercised through the gateway.
- Browser verification on `/register` with `WEEN-1024` confirmed the network-error message appears, the typed code remains visible, and the validate button is disabled.
