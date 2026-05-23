# Phone Registration And 2FA Implementation Plan

## Summary
- Implement opt-in 2FA for all roles (`ADMIN`, `RH`, `MANAGER`, `EMPLOYEE`) and keep existing users compatible.
- Add optional `telephone` to registration, normalized and persisted through auth-service to organisation-service.
- Extend the existing 2FA foundation instead of creating a parallel flow: auth-service remains the public auth API; organisation-service remains the source of truth for users and 2FA settings.
- Create the requested reports during implementation: `AUTH_REGISTER_2FA_ANALYSIS.md`, `AUTH_2FA_IMPLEMENTATION_PLAN.md`, `AUTH_2FA_BACKEND_REPORT.md`, `AUTH_2FA_FRONTEND_REPORT.md`, `AUTH_2FA_SECURITY_NOTES.md`.

## Backend Changes
- Registration:
  - Add optional `telephone` to auth-service and organisation-service `RegisterRequest`.
  - Normalize if present: trim, remove spaces/hyphens/dots/parentheses, convert leading `00` to `+`, require final international form like `+21612345678`.
  - Persist to existing `Utilisateur.telephone`; no breaking migration needed because the column already exists and remains nullable.

- 2FA data model:
  - Keep existing `Utilisateur.twoFactorEnabled`, `twoFactorSecret`, `twoFactorType`, `backupCodes`, `failed2faAttempts`, `lockoutEnd`.
  - Add `SMS` and canonical `TOTP` support while accepting legacy `AUTHENTICATOR`.
  - Add organisation-service Flyway migration/table `two_factor_otps` for email/SMS OTP hashes with: `id`, `user_id`, `code_hash`, `method`, `purpose`, `expires_at`, `consumed_at`, `attempts`, `created_at`, `ip_address`.
  - Never store OTP plaintext. Store BCrypt hashes; raw OTP is only generated/sent by auth-service and verified through protected internal organisation endpoints.

- 2FA API contract:
  - Keep legacy endpoints temporarily, but move Angular to canonical endpoints:
    - `POST /api/v1/auth/2fa/setup/totp`
    - `POST /api/v1/auth/2fa/confirm/totp`
    - `POST /api/v1/auth/2fa/send`
    - `POST /api/v1/auth/2fa/verify`
    - `POST /api/v1/auth/2fa/disable`
  - Login without 2FA returns the normal final JWT.
  - Login with 2FA returns no final JWT and includes both new and legacy fields:
    - `requiresTwoFactor`, `requires2FA`, `temporaryToken`, `tempToken`, `availableMethods`, `maskedEmail`, `maskedPhone`.
  - Final access JWTs include `tokenPurpose=ACCESS` and `twoFactorVerified=true`.
  - Temporary 2FA JWTs include `tokenPurpose=2FA`, expire after 5 minutes, and are rejected outside `/auth/2fa/send` and `/auth/2fa/verify`.

- Security hardening:
  - Fix auth-service security matcher order so setup/confirm/disable require a normal authenticated JWT.
  - Update gateway/auth filters to reject temporary 2FA tokens on protected APIs.
  - Protect new organisation internal 2FA persistence endpoints with `X-Internal-Service-Key`; update auth-service Feign calls to send it.
  - Replace AES/ECB TOTP secret encryption with AES-GCM using a configured encryption key; support legacy decrypt as fallback for already-enrolled users.
  - Email OTP uses SMTP sender when configured; dev-only logger sender is allowed only in dev and must not return OTPs to the frontend.
  - SMS uses `SmsOtpSender`; dev logs only in dev, production returns a clear provider-not-configured error until Twilio/local provider config exists.

## Frontend Changes
- Register page:
  - Add visible optional `Téléphone` field on “Informations personnelles”.
  - Validate international-style input if provided, normalize before sending as `telephone`, and keep the current 5-step registration design.
  - Keep invitation-code behavior intact.

- Login and 2FA verification:
  - Update `AuthService` and `ApiConfigService` to use canonical 2FA endpoints.
  - Login redirects to `/auth/verify-2fa` when `requiresTwoFactor` or `requires2FA` is true.
  - Verification screen supports method selection: Authenticator app, Email code, SMS code when available.
  - Add resend for Email/SMS with 60-second countdown, loading states, and clear French errors:
    - `Code expiré.`
    - `Code incorrect.`
    - `Trop de tentatives. Réessayez plus tard.`
    - `Service indisponible. Réessayez plus tard.`

- Profile/settings:
  - Use the existing profile 2FA component as the base.
  - Initialize UI from `profile.twoFactorEnabled` and `profile.twoFactorType`.
  - Use backend-provided `qrCodeBase64`, not an external QR image service.
  - Add TOTP setup/confirm, Email OTP enable/confirm, SMS enable path when phone exists, backup codes display, and disable flow requiring password or valid 2FA code.

## Test Plan
- Backend:
  - Register with and without phone; normalized phone persists.
  - Login without 2FA returns final JWT with `twoFactorVerified=true`.
  - Login with 2FA returns temporary token and no final JWT.
  - Valid TOTP returns final JWT; invalid TOTP fails; reused/expired temporary token fails.
  - Email/SMS OTP stores only hash, expires after 5 minutes, cannot be reused, enforces max attempts and resend cooldown.
  - Disable 2FA requires password or valid current 2FA code.
  - Temporary 2FA token cannot call protected APIs.

- Frontend:
  - Register form displays phone and includes normalized `telephone`.
  - Login 2FA response opens verification screen.
  - Valid 2FA redirects by role.
  - Invalid/expired/locked/network errors show clean messages.
  - Profile setup uses backend QR base64 and reflects enabled/disabled state.

- Validation commands:
  - Auth-service tests/compile.
  - Organisation-service tests/compile.
  - Gateway compile if JWT filter changes.
  - Frontend: `npx tsc --noEmit -p tsconfig.app.json` and `npm run build`.
  - Manual browser validation with Playwright on `/register`, `/login`, and profile 2FA settings.

## Assumptions
- 2FA is opt-in at launch for every role, not mandatory globally.
- Phone number is optional during registration; SMS requires a stored phone number.
- API payload field will be `telephone` to match the existing backend/frontend model.
- Existing legacy 2FA users using `AUTHENTICATOR` remain valid while new setup persists canonical `TOTP`.
