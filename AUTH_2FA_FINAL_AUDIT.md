# WeenTime 2FA Final Audit

Date: 2026-05-23

## Scope

This audit covers the current phone registration and two-factor authentication implementation across:

- `weentime-backend/services/auth-service`
- `weentime-backend/services/organisation-service`
- `weentime-backend/services/gateway`
- `weentime-frontend/angular-weentime`

The final architecture keeps TOTP as the primary 2FA method, with Email OTP as fallback and SMS as architecture-ready only.

## Implemented Files

### Auth Service

- `controller/AuthController.java`
  - Login returns a temporary 2FA token when 2FA is enabled.
  - Final JWT is returned only after `/api/v1/auth/2fa/verify` succeeds.
  - Canonical TOTP endpoints are present:
    - `POST /api/v1/auth/2fa/setup/totp`
    - `POST /api/v1/auth/2fa/confirm/totp`
    - `POST /api/v1/auth/2fa/verify`
    - `POST /api/v1/auth/2fa/send`
    - `POST /api/v1/auth/2fa/disable`
  - TOTP users now receive available methods including `TOTP` and `EMAIL`; `SMS` appears only when a phone exists and the dev SMS sender is available.
  - `/2fa/send` requires a valid temporary 2FA token and rejects TOTP sends.
  - Email/SMS OTP cooldown is checked before sending.

- `security/services/TwoFactorService.java`
  - Uses `com.warrenstrange:googleauth`, which is Google Authenticator-compatible.
  - Generates Base32 TOTP secrets and verifies 6-digit TOTP codes.
  - Builds `otpauth://totp/WeenTime:<email>?secret=...&issuer=WeenTime&digits=6&period=30`.
  - Generates QR code Base64 PNG through ZXing.
  - Encrypts new TOTP secrets with AES-GCM and keeps legacy AES decrypt fallback.
  - Hashes OTP/backup codes with the configured `PasswordEncoder`.

- `security/JwtUtils.java`
  - Final access JWTs include `tokenPurpose=ACCESS` and `twoFactorVerified=true`.
  - Temporary tokens include `tokenPurpose=2FA`, expire in 5 minutes, and are rejected as access tokens.
  - Access token validation now requires `twoFactorVerified=true` when `tokenPurpose=ACCESS`.

- `security/AuthTokenFilter.java`
  - Authenticates only valid access tokens.
  - Publicly skips login/register/2FA verify/2FA send only.

- `security/WebSecurityConfig.java`
  - Setup, confirm, disable, and admin auth endpoints require an authenticated access token.

- `security/services/EmailService.java`
  - Sends email OTP through SMTP.
  - Logs OTP only in dev/local when SMTP fails.
  - Production SMTP failures return a clean service-unavailable response from the controller.

- `security/services/SmsOtpSender.java`
  - Dev/local-only logger implementation.
  - Production returns `SMS_PROVIDER_NOT_CONFIGURED`.

- DTOs updated/added:
  - `RegisterRequest`
  - `JwtResponse`
  - `Verify2faRequest`
  - `TwoFactorSendRequest`
  - `TwoFactorSetupResponse`
  - `TwoFactorDisableRequest`
  - `StoreTwoFactorOtpRequest`
  - `VerifyTwoFactorOtpRequest`
  - `OtpVerificationResponse`

### Organisation Service

- `entity/Utilisateur.java`
  - Stores nullable `telephone`.
  - Stores existing 2FA state: `twoFactorEnabled`, `twoFactorSecret`, `twoFactorType`, backup codes, failed attempts, lockout.

- `entity/TwoFactorOtp.java`
  - Stores email/SMS OTP hashes, expiry, consumed state, attempts, purpose, and IP address.

- `repository/TwoFactorOtpRepository.java`
  - Finds latest unconsumed OTP by user email, method, and purpose.

- `service/impl/TwoFactorOtpServiceImpl.java`
  - Stores only BCrypt hashes.
  - Enforces 5-minute expiry, 60-second resend cooldown, max 5 attempts, one-time consumption.

- `controller/InternalUtilisateurController.java`
  - 2FA persistence endpoints require `X-Internal-Service-Key`.

- `service/impl/UtilisateurServiceImpl.java`
  - Registration persists normalized nullable `telephone`.
  - Phone normalization removes spaces, dots, dashes, parentheses and converts `00` prefix to `+`.
  - Accepts canonical `TOTP` and legacy `AUTHENTICATOR`.

- `db/migration/V14__add_two_factor_otps.sql`
  - Adds `two_factor_otps` persistence table and index.

### Gateway

- `security/JwtGlobalFilter.java`
  - Public auth paths are limited to login, register, token validate, `/2fa/verify`, and `/2fa/send`.
  - Protected auth endpoints now require an access token at the gateway.

- `security/JwtUtils.java`
  - Rejects temporary 2FA tokens and requires `twoFactorVerified=true` on `ACCESS` tokens.

### Frontend Angular

- `src/app/features/auth/register/register.component.ts/html`
  - Adds optional `telephone` field in the personal information step.
  - Normalizes phone before sending.
  - Sends payload field `telephone`.

- `src/app/features/auth/login/login.component.ts`
  - Detects `requiresTwoFactor` or legacy `requires2FA`.
  - Navigates to `/auth/verify-2fa` with temporary token only in router state.
  - Does not store temporary token as a normal JWT.

- `src/app/features/auth/verify-2fa/*`
  - Supports method selection.
  - TOTP is primary.
  - Email/SMS resend is available only for non-TOTP methods.
  - Handles clean French errors for invalid, expired, locked, session-expired, and network/provider states.

- `src/app/features/shared-profile/components/profile-two-factor/profile-two-factor.component.ts`
  - Uses backend `qrCodeBase64`.
  - Supports TOTP setup/confirm.
  - Supports Email OTP setup.
  - SMS setup is architecture-ready and disabled in production unless configured.
  - Disable flow sends password or code to the backend.

- `src/app/features/shared-profile/profile.service.ts`
  - Uses canonical TOTP setup/confirm endpoints.

- `src/app/core/services/auth.service.ts`
  - Uses canonical verify/send 2FA endpoints.
  - Stores only final access JWTs.

- `src/environments/environment*.ts`
  - Adds `smsOtpEnabled` to keep SMS visible only for configured/dev environments.

## Missing Or Deferred Pieces

- `dev.samstevens.totp` was not introduced because `com.warrenstrange:googleauth` is already present, compatible with authenticator apps, and works with QR generation through ZXing.
- SMS has no paid provider integration. This is intentional; current implementation is dev/local logger only and production returns provider-not-configured.
- Email provider availability depends on SMTP configuration. Production failures return a clean provider-not-configured/service-unavailable response.
- The auth-service still exposes legacy aliases (`/verify-2fa`, `/2fa/setup`, `/2fa/confirm`) for compatibility. Angular now uses canonical endpoints.
- Old pre-claim JWTs without `tokenPurpose` are still accepted by service-level `isAccessToken` only when they contain `userId`, preserving short-term compatibility. New final tokens include the required claims.

## Security Notes

- No access JWT is returned until 2FA verification succeeds.
- Temporary 2FA tokens use `tokenPurpose=2FA`, expire after 5 minutes, and cannot authenticate protected APIs.
- Gateway and service filters reject `tokenPurpose=2FA` for protected routes.
- Final tokens include `tokenPurpose=ACCESS` and `twoFactorVerified=true`.
- TOTP secrets are encrypted before persistence.
- OTP values are never returned to the frontend and are stored only as BCrypt hashes.
- OTP resend cooldown is checked before sending to avoid sending unusable codes during cooldown.
- TOTP accepts only 6 numeric digits.

## Validation Results

- Auth service: `.\mvnw.cmd test` passed.
- Organisation service: `.\mvnw.cmd test` passed.
- Gateway: `.\mvnw.cmd -DskipTests compile` passed.
- Frontend focused spec: `npx vitest run src/app/features/auth/register/register.component.spec.ts --environment jsdom` passed.
- Frontend type check: `npx tsc --noEmit -p tsconfig.app.json` passed.
- Frontend build: `npm run build` passed with existing bundle/CommonJS budget warnings.
- Browser smoke:
  - `/register` loaded.
  - `/login` loaded.
  - `/auth/verify-2fa` redirected to `/login` without temporary token state.
  - Protected profile route redirected to `/login` without an access token.

## Final Architecture

1. User registers with optional normalized `telephone`.
2. User logs in with email/password.
3. If 2FA is disabled, auth-service returns final access JWT.
4. If 2FA is enabled, auth-service returns `requiresTwoFactor=true`, legacy `requires2FA=true`, and a temporary 5-minute 2FA token.
5. Frontend opens `/auth/verify-2fa` with the temporary token in router state only.
6. TOTP verification checks the encrypted user TOTP secret from organisation-service.
7. Email/SMS fallback verifies hashed OTP rows from organisation-service.
8. Successful verification returns the final access JWT with `tokenPurpose=ACCESS` and `twoFactorVerified=true`.
9. Gateway and service filters accept only access tokens on protected routes.
