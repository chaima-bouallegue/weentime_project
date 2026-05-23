# WeenTime 2FA Manual Test Guide

Date: 2026-05-23

## Prerequisites

1. Start the backend services needed for auth:
   - config/eureka if used locally
   - gateway
   - organisation-service
   - auth-service
   - PostgreSQL
   - Redis if the auth-service 2FA attempt cache is enabled
2. Confirm the organisation DB migration exists and has run:
   - `V14__add_two_factor_otps.sql`
3. Start the frontend:
   - `cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime`
   - `npm start -- --host 127.0.0.1 --port 4200`
4. Install Google Authenticator, Microsoft Authenticator, or Authy on a phone.

## Test 1 - Register With Phone

1. Open `http://localhost:4200/register`.
2. Enter a valid active invitation code.
3. On "Informations personnelles", fill:
   - first name
   - last name
   - email
   - password
   - job title
   - telephone, for example `+216 12 345 678`
4. Complete registration.
5. Verify the user row has normalized phone:
   - `+21612345678`

Read-only SQL example:

```sql
select id, email, telephone
from utilisateurs
where email = 'new.user@example.com';
```

## Test 2 - Login Without 2FA

1. Open `http://localhost:4200/login`.
2. Login with a user where `two_factor_enabled = false`.
3. Confirm the app redirects directly to the role dashboard.
4. Decode the JWT and confirm:
   - `tokenPurpose = ACCESS`
   - `twoFactorVerified = true`

PowerShell:

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"user@example.com","password":"Password123!","motDePasse":"Password123!"}'

$login.data.token
```

## Test 3 - Enable TOTP

1. Login normally.
2. Go to profile/security.
3. Click "Application d'authentification".
4. Confirm a QR code appears from `qrCodeBase64`.
5. Scan it with Google Authenticator, Microsoft Authenticator, or Authy.
6. Enter the 6-digit code.
7. Confirm the UI shows `2FA activee`.
8. Confirm the DB user has:
   - `two_factor_enabled = true`
   - `two_factor_type = TOTP`
   - encrypted `two_factor_secret`

PowerShell setup example:

```powershell
$accessToken = "<ACCESS_TOKEN>"

$setup = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/2fa/setup/totp" `
  -Headers @{ Authorization = "Bearer $accessToken" } `
  -ContentType "application/json" `
  -Body '{}'

$setup.data.otpauthUrl
$setup.data.qrCodeBase64
```

PowerShell confirm example:

```powershell
$secret = "<SECRET_FROM_SETUP_RESPONSE>"
$code = "<CODE_FROM_AUTHENTICATOR_APP>"

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/2fa/confirm/totp" `
  -Headers @{ Authorization = "Bearer $accessToken" } `
  -ContentType "application/json" `
  -Body (@{ secret = $secret; code = $code } | ConvertTo-Json)
```

## Test 4 - Login With TOTP

1. Logout.
2. Login with email and password.
3. Confirm the response does not include final access JWT.
4. Confirm the response includes:
   - `requiresTwoFactor = true`
   - `requires2FA = true`
   - `temporaryToken`
   - `availableMethods` including `TOTP`
5. Enter the current authenticator app code.
6. Confirm final access JWT is stored.
7. Confirm redirect by role.

PowerShell:

```powershell
$login2fa = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"user@example.com","password":"Password123!","motDePasse":"Password123!"}'

$tempToken = $login2fa.data.temporaryToken
$code = "<CODE_FROM_AUTHENTICATOR_APP>"

$verified = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/2fa/verify" `
  -ContentType "application/json" `
  -Body (@{
    temporaryToken = $tempToken
    code = $code
    method = "TOTP"
  } | ConvertTo-Json)

$verified.data.token
```

## Test 5 - Wrong Code

1. Login with 2FA-enabled user.
2. On `/auth/verify-2fa`, enter `000000`.
3. Confirm:
   - message is `Code incorrect.`
   - no final JWT is stored
   - protected routes remain inaccessible

## Test 6 - Temporary Token Protection

1. Login with a 2FA-enabled user.
2. Copy `temporaryToken`.
3. Call a protected endpoint using the temporary token as Bearer.
4. Expected: `401` or `403`.

PowerShell:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:8322/api/v1/users/me" `
  -Headers @{ Authorization = "Bearer $tempToken" }
```

The request must fail. The same endpoint should work with the final access token returned after `/auth/2fa/verify`.

```powershell
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:8322/api/v1/users/me" `
  -Headers @{ Authorization = "Bearer $($verified.data.token)" }
```

## Test 7 - Email OTP Fallback

1. Login with a TOTP-enabled user.
2. Confirm `availableMethods` includes `EMAIL`.
3. Choose Email on the verification screen.
4. Click resend/send code.
5. Confirm the frontend does not display the raw OTP.
6. In dev/local, read the auth-service log for the OTP if SMTP is not configured.
7. Enter the email OTP.
8. Confirm final JWT is issued.
9. Try the same OTP again and confirm it fails.

PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8322/api/v1/auth/2fa/send" `
  -ContentType "application/json" `
  -Body (@{
    temporaryToken = $tempToken
    method = "EMAIL"
    purpose = "LOGIN"
  } | ConvertTo-Json)
```

## Test 8 - SMS Architecture

1. In production configuration, confirm SMS option is hidden/disabled.
2. In dev/local, if `smsOtpEnabled = true` and the user has `telephone`, SMS can be selected.
3. If backend SMS provider is not configured, the API must return a clean provider-not-configured response.
4. Confirm no paid provider is required for the current implementation.

## Expected User-Facing Errors

- Invalid TOTP/OTP: `Code incorrect.`
- Expired OTP: `Code expire.`
- Too many attempts: `Trop de tentatives. Reessayez plus tard.`
- Expired temporary token: `Session expiree. Reconnectez-vous.`
- Network/provider issue: `Service indisponible. Reessayez plus tard.`

## Validation Commands

Backend:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\auth-service
.\mvnw.cmd test

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\organisation-service
.\mvnw.cmd test

cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\gateway
.\mvnw.cmd -DskipTests compile
```

Frontend:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-frontend\angular-weentime
npx vitest run src/app/features/auth/register/register.component.spec.ts --environment jsdom
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
