# Attendance Data Audit — WeenTime ML Service

Source of truth: `weentime-backend/services/presence-service` (Spring Boot, PostgreSQL).

## 1. Raw entities

### `Presence` (table `presences`)
File: `entity/Presence.java`

| Field | DB column | Type | Notes |
|---|---|---|---|
| `id` | `id` | Long PK | |
| `utilisateurId` | `utilisateur_id` | Long | FK to employee, **not nullable** |
| `date` | `date_presence` | LocalDate | day of presence |
| `heureEntree` | `heure_entree` | LocalDateTime | check-in timestamp |
| `heureSortie` | `heure_sortie` | LocalDateTime | check-out timestamp, **nullable** |
| `totalHeuresTravaillees` | `total_heures_travaillees` | BigDecimal(6,2) | summed worked hours |
| `status` | `status` | `PresenceStatus` | PRESENT, ABSENT, LATE, HALF_DAY, REMOTE, ON_LEAVE |
| `source` | `source` | `PresenceSource` | WEB, MOBILE, GPS, MANUAL |
| `localisation` | `localisation` | String | free text location |
| `createdAt` / `updatedAt` | timestamps | LocalDateTime | |

Unique constraint: `(utilisateur_id, date_presence)`.

### `AttendanceSession` (table `attendance_sessions`)
File: `entity/AttendanceSession.java`

| Field | DB column | Type | Notes |
|---|---|---|---|
| `id` | `id` | Long PK | |
| `utilisateurId` | `utilisateur_id` | Long | FK |
| `date` | `attendance_date` | LocalDate | |
| `checkInTime` | `check_in_time` | LocalDateTime | |
| `checkOutTime` | `check_out_time` | LocalDateTime | **nullable** when session OPEN |
| `duration` | `duration` | Long | seconds (closed sessions only) |
| `status` | `status` | `AttendanceSessionStatus` | OPEN, CLOSED |
| `source` | `source` | `PresenceSource` | WEB, MOBILE, GPS, MANUAL |
| `localisation` | `localisation` | String | |
| `lateArrival` | `late_arrival` | Boolean | precomputed retard flag |
| `dailyStatus` | `daily_status` | `AttendanceDayStatus` | WORKING, IDLE, LATE, ABSENT, REMOTE, ON_LEAVE |

This is the **primary record set** for anomaly detection — fine-grained sessions, multiple per day possible.

### `Overtime` (table `overtimes`)

Tracks `heuresSupplementaires` (BigDecimal) per `(utilisateurId, date)` with `approuvee` Boolean. Useful as a context feature (does today's long duration map to approved overtime?).

## 2. Configured schedule (Africa/Tunis tz)

From `application.yml`:

- Work start: `09:00`
- Work end: `18:00`
- Tolerance: `10` minutes (anything past `09:10` counts as late)
- Working days: MON–FRI
- Half-day threshold: 4.0 hours

These are the **canonical expected values** used by the late-detection logic. Anomaly thresholds reference them.

## 3. Derived feature catalog

Stable input vector for the model (order MUST not change after training; checked in `IsolationForest` wrapper):

| # | Feature | Source | Formula | Notes |
|---|---|---|---|---|
| 0 | `arrival_hour` | `checkInTime` | `hour + minute/60` | float 0..24 |
| 1 | `departure_hour` | `checkOutTime` | `hour + minute/60`, else 0.0 | 0 when missing |
| 2 | `worked_hours` | `duration` (preferred), else `(checkOut-checkIn)/3600` | float | 0 when checkout missing |
| 3 | `late_minutes` | `checkInTime` vs `09:10` | `max(0, (checkIn - 09:10) min)` | uses tolerance |
| 4 | `weekday` | `date` | `date.weekday()` 0=Mon..6=Sun | int |
| 5 | `is_weekend` | `weekday` | `1 if weekday>=5 else 0` | binary |
| 6 | `missing_checkout` | `checkOutTime` | `1 if None else 0` | binary |
| 7 | `remote_flag` | `dailyStatus == REMOTE` | binary | |
| 8 | `weekly_hours` | sum over last 7 days for same employee | float | from history |
| 9 | `avg_checkin_hour_30d` | mean `arrival_hour` for employee, last 30d, excluding current row | float | 9.0 if no history |
| 10 | `deviation_from_usual` | `abs(arrival_hour - avg_checkin_hour_30d)` | float | flags personal-baseline drift |
| 11 | `behavior_delta_weekly` | `weekly_hours_current - weekly_hours_avg_last_4_weeks` | float | 0 if insufficient history |
| 12 | `night_activity` | `arrival_hour` | `1 if arrival_hour<6 or arrival_hour>22 else 0` | binary |
| 13 | `rapid_session` | `worked_hours` | `1 if 0 < worked_hours < 0.5 else 0` | catches micro-sessions |
| 14 | `overtime_excess` | `worked_hours` | `1 if worked_hours>10 else 0` | binary |

All features are numeric → fed to `StandardScaler` → `IsolationForest`. No categorical encoding needed for v1 (employee identity intentionally excluded so model generalises rather than memorises).

## 4. Endpoints the ML service consumes

From discovery — `weentime-backend/services/presence-service/controller/`:

| Endpoint | Used for | Notes |
|---|---|---|
| `GET /api/v1/presence/company/today` (RH) | today's company-wide presence | Wrapped in `ApiResponse<TeamStatusResponse>` |
| `GET /api/v1/presence/global/analytics` (ADMIN) | global stats | `GlobalPresenceAnalyticsDTO` |
| `GET /api/v1/presence/team/today` (MANAGER) | manager team status | `TeamStatusResponse` |
| `GET /api/v1/presence/team/history` (MANAGER) | team paginated history | `Page<AttendanceSessionViewDTO>` |
| `GET /api/v1/presence/history` (EMPLOYEE+) | personal paginated history | `PresenceHistoryResponse` |
| `GET /api/v1/presences/pointages/enterprise/status-range` | bulk date-range | `Map<LocalDate, TeamStatusResponse>` |

Gateway base: `http://localhost:8322`. JWT secret: `jwt.secret` in presence-service yml.

## 5. Known nullability and edge cases

- `checkOutTime` is null while session is OPEN → drives `missing_checkout = 1`.
- Same `(utilisateurId, date)` can have multiple sessions in `attendance_sessions` (lunch break check-out/in). Anomaly detector treats each session as a row; the dashboard aggregates per employee/day.
- `Presence` rows may exist without sessions (manual entry) — we prefer `AttendanceSession` and fall back to `Presence` only when no sessions exist.
- `Africa/Tunis` is the system timezone — all hour math is local, not UTC.
- DDL is `update` (no Flyway-enforced schema) — fields can drift; the ML feature engineer must validate input shape and `None`-default missing keys.

## 6. Synthetic data alignment

For local training without prod data, `training/generate_synthetic_attendance.py` produces rows matching the `AttendanceSessionDTO` shape (utilisateurId, date, checkInTime, checkOutTime, duration, lateArrival, source, localisation). This keeps the feature engineer code path identical between training and inference.
