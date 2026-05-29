# Config Server Eureka Fix Report

Date: 2026-05-23

## Root cause

`config-server` was failing Eureka registration because the runtime client was attempting to use the default/old Eureka endpoint:

- `http://localhost:8761/eureka/`
- `http://localhost:8761/eureka/apps/`

The local Discovery server for this project runs on:

- `http://localhost:8861/eureka/`

To make the effective local configuration explicit, `config-server` now declares its Eureka registration settings directly in its own `application.yml`, including the requested instance id format. The Discovery service local configuration also declares the expected Eureka server settings.

Duplicate config check:

- `services/config-server/src/main/resources/bootstrap.yml` does not exist.
- `services/config-server/src/main/resources/configurations/config-server.yml` does not exist.
- `services/config-server/config-repo/config-server.yml` does not exist.

So `config-server` is not reading a duplicated older `config-server.yml` from those locations.

## Files changed

- `services/config-server/src/main/resources/application.yml`
  - Ensured `server.port: 8988`.
  - Ensured `spring.application.name: config-server`.
  - Ensured Eureka registration is enabled.
  - Ensured `defaultZone` points to `http://localhost:8861/eureka/`.
  - Added requested comment: `# Local Eureka server is 8861, not the default 8761`.
  - Added requested `eureka.instance.instance-id`.

- `services/discovery/src/main/resources/application.yml`
  - Ensured `server.port: 8861`.
  - Ensured `spring.application.name: discovery-service`.
  - Ensured Eureka self-registration and registry fetching are disabled.
  - Ensured `defaultZone` points to `http://localhost:8861/eureka/`.
  - Added requested comment: `# Local Eureka server is 8861, not the default 8761`.
  - Added `eureka.server.enable-self-preservation: false`.

No controllers, services, entities, business logic, or service ports were changed.

## Old value

```yaml
eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
```

Also treated as wrong for this local setup:

```text
http://localhost:8761/eureka/apps/
```

## New value

```yaml
eureka:
  client:
    service-url:
      # Local Eureka server is 8861, not the default 8761
      defaultZone: http://localhost:8861/eureka/
```

`config-server` now also has:

```yaml
eureka:
  instance:
    prefer-ip-address: true
    instance-id: ${spring.cloud.client.ip-address:${spring.application.name}}:${spring.application.name}:${server.port}
```

## Validation performed

Requested command:

```powershell
mvn -pl services/config-server -am clean compile
```

Result: could not run as written because `weentime-backend` has no root `pom.xml` and no Maven reactor module named `services/config-server`.

Equivalent command run successfully:

```powershell
mvn -f services/config-server/pom.xml clean compile
```

Result: `BUILD SUCCESS`.

Runtime validation:

- Started `discovery-service` first.
- Started `config-server` second.
- `http://localhost:8861/eureka/apps/CONFIG-SERVER` returned `CONFIG-SERVER` with status `UP`.
- Registered instance id observed: `192.168.1.194:config-server:8988`.
- Config-server log showed registration status `204`.
- Temporary validation processes were stopped after verification.

Log scan:

```powershell
rg -n "localhost:8761|DefaultEndpoint|serviceUrl|heartbeat failed|registration failed" -S .tmp-config-server-eureka-fix-logs
```

Result: no matches.

Repository scan:

```powershell
rg -n "8761" -S .
```

Remaining `8761` references are documentation/comment text only:

- Historical report text in `EUREKA_GATEWAY_REGISTRATION_FIX_REPORT.md`.
- The required explanatory comments added to config YAML.
- This report's old-value documentation.

No live YAML `defaultZone` points at `localhost:8761`.

## How to test manually

From `C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend`:

```powershell
mvn -f services/discovery/pom.xml spring-boot:run
```

Open:

```text
http://localhost:8861
```

In a second terminal:

```powershell
mvn -f services/config-server/pom.xml spring-boot:run
```

Then validate:

```powershell
Invoke-RestMethod http://localhost:8861/eureka/apps/CONFIG-SERVER -Headers @{ Accept = 'application/json' }
```

Expected result:

- `CONFIG-SERVER` appears in registered instances.
- Instance status is `UP`.
- Config-server logs do not contain `localhost:8761`.

## Startup order

1. `discovery-service` on port `8861`.
2. `config-server` on port `8988`.

## Remaining risks

- The exact requested Maven reactor command requires a root aggregator `pom.xml`; this backend currently uses per-service POMs.
- `config-repo/*.yml` files still allow environment-variable overrides such as `EUREKA_DEFAULT_ZONE`. If an external environment sets that variable to `http://localhost:8761/eureka/`, it can reintroduce the old endpoint for services that read those config files.
- Existing historical reports intentionally mention `8761`; those are not live service configuration.
