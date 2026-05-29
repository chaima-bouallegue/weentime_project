# Eureka And Gateway Registration Fix Report

## Root Cause

The services were not registering in Eureka because the effective client configuration was inconsistent in two places:

1. Local service `src/main/resources/application.yml` files still disabled Eureka or pointed to `http://localhost:8761/eureka/`.
2. `config-server` serves local shared config from `classpath:/configurations`, and those YAML files also contained old `8761` values, disabled clients, malformed `eureka` blocks, and stale service ports.

That meant services either never attempted registration or fetched stale remote config that overrode local corrections.

## Chosen Fix

- Kept `discovery-service` as a pure Eureka server:
  - `register-with-eureka: false`
  - `fetch-registry: false`
  - `defaultZone: http://localhost:8861/eureka/`
- Enabled Eureka clients for:
  - `config-server`
  - `gateway`
  - `auth-service`
  - `organisation-service`
  - `rh-service`
  - `presence-service`
  - `communication-service`
- Set `prefer-ip-address: true` on clients.
- Corrected the config-server shared config source under `src/main/resources/configurations`.
- Corrected the fallback `config-repo` copies for consistency.
- Kept gateway direct `http://localhost:*` routes in place for local development.
- Updated frontend gateway/API URLs from `8322` to `8222`.

## Files Changed

### Backend local service config

- `services/discovery/src/main/resources/application.yml`
- `services/config-server/src/main/resources/application.yml`
- `services/gateway/src/main/resources/application.yml`
- `services/auth-service/src/main/resources/application.yml`
- `services/auth-service/src/main/resources/bootstrap-local.yml`
- `services/organisation-service/src/main/resources/application.yml`
- `services/organisation-service/src/main/resources/bootstrap-local.yml`
- `services/presence-service/src/main/resources/application.yml`
- `services/rh-service/src/main/resources/application.yml`
- `services/communication-service/src/main/resources/application.yml`

### Config-server shared config actually used locally

- `services/config-server/src/main/resources/configurations/application.yml`
- `services/config-server/src/main/resources/configurations/discovery-service.yml`
- `services/config-server/src/main/resources/configurations/gateway.yml`
- `services/config-server/src/main/resources/configurations/auth-service.yml`
- `services/config-server/src/main/resources/configurations/organisation-service.yml`
- `services/config-server/src/main/resources/configurations/presence-service.yml`
- `services/config-server/src/main/resources/configurations/rh-service.yml`
- `services/config-server/src/main/resources/configurations/communication-service.yml`

### Config-server fallback config-repo copies

- `services/config-server/config-repo/application.yml`
- `services/config-server/config-repo/discovery-service.yml`
- `services/config-server/config-repo/gateway.yml`
- `services/config-server/config-repo/auth-service.yml`
- `services/config-server/config-repo/organisation-service.yml`
- `services/config-server/config-repo/presence-service.yml`
- `services/config-server/config-repo/rh-service.yml`

### Frontend

- `../weentime-frontend/angular-weentime/src/environments/environment.ts`
- `../weentime-frontend/angular-weentime/src/environments/environment.production.ts`
- `../weentime-frontend/angular-weentime/src/environments/environment.example.ts`
- `../weentime-frontend/angular-weentime/src/app/core/services/ai-copilot.service.spec.ts`

## Old Wrong Values

- `http://localhost:8761/eureka/`
- `http://localhost:8761/eureka/apps/`
- `eureka.client.enabled: false`
- `register-with-eureka: false` on client services
- `fetch-registry: false` on client services
- malformed nested `eureka.eureka.client...`
- `spring.cloud.discovery.enabled: false` in `rh-service`
- stale service ports in shared config:
  - `8761` for discovery
  - `8081` for auth
  - `8090` for organisation
  - `8093` for presence
  - `8092` RH integration target
- frontend gateway/API URLs on `8322`

## New Correct Values

- `http://localhost:8861/eureka/`
- client services:
  - `register-with-eureka: true`
  - `fetch-registry: true`
  - `prefer-ip-address: true`
- discovery server:
  - `register-with-eureka: false`
  - `fetch-registry: false`
  - `defaultZone: http://localhost:8861/eureka/`
- corrected local ports:
  - discovery `8861`
  - config-server `8988`
  - gateway `8222`
  - auth `8181`
  - organisation `8190`
  - rh `8192`
  - presence `8193`
  - communication `8194`
- frontend API base:
  - `http://localhost:8222/api/v1`

## Startup Order Used

1. `discovery-service`
2. `config-server`
3. `gateway`
4. `auth-service`
5. `organisation-service`
6. `rh-service`
7. `presence-service`
8. `communication-service`

Background logs were written to:

- `.tmp-eureka-fix-logs/`

## Validation Results

### Backend compile

All affected backend services compiled successfully with:

```powershell
.\mvnw.cmd clean compile -DskipTests
```

Run in:

- `services/discovery`
- `services/config-server`
- `services/gateway`
- `services/auth-service`
- `services/organisation-service`
- `services/rh-service`
- `services/presence-service`
- `services/communication-service`

### Frontend validation

Succeeded:

```powershell
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

Angular build still reports existing budget/CommonJS warnings, but it completed successfully.

### Eureka registration

Verified live via:

```powershell
Invoke-RestMethod http://localhost:8861/eureka/apps -Headers @{ Accept = 'application/json' }
```

Registered instances observed:

- `GATEWAY`
- `AUTH-SERVICE`
- `ORGANISATION-SERVICE`
- `RH-SERVICE`
- `PRESENCE-SERVICE`
- `COMMUNICATION-SERVICE`
- `CONFIG-SERVER`

All reported `Status=UP`.

### Gateway login path

Verified against:

```powershell
Invoke-WebRequest http://localhost:8222/api/v1/auth/login `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"invalid@example.com","password":"invalid"}'
```

Observed response: `401`

That confirms the request reached the auth service through the gateway. It is no longer a registration/routing failure.

## Manual Test Commands

### Check Eureka dashboard

```powershell
Start-Process http://localhost:8861
```

### Check registered apps via API

```powershell
Invoke-RestMethod http://localhost:8861/eureka/apps -Headers @{ Accept = 'application/json' }
```

### Check gateway auth route

```powershell
Invoke-WebRequest http://localhost:8222/api/v1/auth/login `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"invalid@example.com","password":"invalid"}'
```

### Tail service logs

```powershell
Get-Content .tmp-eureka-fix-logs\\gateway.out.log -Wait
Get-Content .tmp-eureka-fix-logs\\auth-service.out.log -Wait
```

## Remaining Risks

- `config-server` currently serves local shared config from `src/main/resources/configurations`. If the team later switches back to a Git-backed external config repository, the same Eureka values must remain aligned there.
- `prefer-ip-address: true` makes Eureka display the local machine IP (`192.168.1.194` during validation) instead of `localhost`. That is expected with the requested setting.
- There are unrelated RH Flyway migration changes already present in the worktree from earlier work. They were not altered as part of this Eureka fix.
