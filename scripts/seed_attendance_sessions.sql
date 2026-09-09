-- ═══════════════════════════════════════════════════════════════════════════════
-- WeenTime – Seed attendance_sessions (v2 – fixed)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. User → entreprise mapping ──────────────────────────────────────────
CREATE TEMP TABLE user_entreprise_map (
    user_id BIGINT PRIMARY KEY,
    entreprise_id BIGINT NOT NULL
);
INSERT INTO user_entreprise_map (user_id, entreprise_id) VALUES
(2, 2), (3, 2), (4, 2),
(6, 2), (7, 2), (8, 2), (9, 2), (10, 2), (11, 2), (14, 2), (15, 2), (16, 2), (17, 2), (19, 2), (20, 2), (23, 2), (27, 2),
(30, 5), (51, 5), (52, 5), (53, 5), (54, 5), (55, 5), (56, 5), (57, 5), (58, 5), (59, 5),
(60, 5), (61, 5), (62, 5), (63, 5), (64, 5), (65, 5), (66, 5), (67, 5), (68, 5), (69, 5),
(70, 5), (71, 5), (72, 5), (73, 5), (74, 5), (75, 5), (76, 5), (77, 5),
(28, 6), (31, 6), (32, 6), (33, 6), (34, 6), (35, 6), (36, 6), (37, 6), (38, 6), (39, 6),
(40, 6), (41, 6), (42, 6), (43, 6), (44, 6), (45, 6), (46, 6), (47, 6), (48, 6), (49, 6), (50, 6),
(29, 7), (78, 7), (79, 7), (80, 7), (81, 7), (82, 7), (83, 7), (84, 7), (85, 7), (86, 7),
(87, 7), (88, 7), (89, 7), (90, 7), (91, 7), (92, 7), (93, 7), (94, 7), (95, 7), (96, 7),
(97, 7), (98, 7);


-- ─── 1. Sync presences → attendance_sessions ────────────────────────────────
INSERT INTO attendance_sessions (
    utilisateur_id, attendance_date, check_in_time, check_out_time,
    duration_seconds, session_status, source, check_in_source, check_out_source,
    localisation, late_arrival, daily_status,
    worked_minutes, expected_minutes, overtime_minutes, early_leave_minutes,
    auto_closed, overtime_mode, created_at, updated_at, version, entreprise_id
)
SELECT
    p.utilisateur_id,
    p.date_presence,
    COALESCE(p.heure_entree, (p.date_presence || ' 08:30:00')::timestamp),
    p.heure_sortie,
    COALESCE(
        CAST(p.total_heures_travaillees * 3600 AS BIGINT),
        CASE WHEN p.heure_sortie IS NOT NULL AND p.heure_entree IS NOT NULL
             THEN CAST(EXTRACT(EPOCH FROM (p.heure_sortie - p.heure_entree)) AS BIGINT)
             ELSE 0 END
    ),
    CASE WHEN p.heure_sortie IS NULL THEN 'OPEN' ELSE 'CLOSED' END,
    COALESCE(p.source, 'WEB'),
    COALESCE(p.source, 'WEB'),
    CASE WHEN p.heure_sortie IS NOT NULL THEN COALESCE(p.source, 'WEB') ELSE NULL END,
    p.localisation,
    p.status = 'LATE',
    CASE
        WHEN p.status = 'LATE' THEN 'LATE'
        WHEN p.status = 'PRESENT' THEN 'WORKING'
        WHEN p.status = 'REMOTE' THEN 'REMOTE'
        WHEN p.status IN ('LEAVE', 'ON_LEAVE') THEN 'HOLIDAY'
        WHEN p.status = 'ABSENT' THEN 'ABSENT'
        ELSE 'WORKING'
    END,
    COALESCE(CAST(p.total_heures_travaillees * 60 AS INTEGER),
        CASE WHEN p.heure_sortie IS NOT NULL AND p.heure_entree IS NOT NULL
             THEN CAST(EXTRACT(EPOCH FROM (p.heure_sortie - p.heure_entree))/60 AS INTEGER)
             ELSE 0 END),
    480,
    GREATEST(0, COALESCE(CAST(p.total_heures_travaillees * 60 AS INTEGER),
        CASE WHEN p.heure_sortie IS NOT NULL AND p.heure_entree IS NOT NULL
             THEN CAST(EXTRACT(EPOCH FROM (p.heure_sortie - p.heure_entree))/60 AS INTEGER)
             ELSE 0 END) - 480),
    GREATEST(0, 480 - COALESCE(CAST(p.total_heures_travaillees * 60 AS INTEGER),
        CASE WHEN p.heure_sortie IS NOT NULL AND p.heure_entree IS NOT NULL
             THEN CAST(EXTRACT(EPOCH FROM (p.heure_sortie - p.heure_entree))/60 AS INTEGER)
             ELSE 0 END)),
    FALSE, 'NONE',
    COALESCE(p.created_at, NOW()), COALESCE(p.updated_at, NOW()),
    COALESCE(p.version, 0),
    COALESCE(m.entreprise_id, 2)
FROM presences p
LEFT JOIN user_entreprise_map m ON m.user_id = p.utilisateur_id
WHERE NOT EXISTS (
    SELECT 1 FROM attendance_sessions a
    WHERE a.utilisateur_id = p.utilisateur_id AND a.attendance_date = p.date_presence
);


-- ─── 2. Anomaly 1: User 34 (MediPlus) – Absence vendredi 4 sept ────────────
-- Delete any auto-generated session for that day, insert absence
DELETE FROM attendance_sessions WHERE utilisateur_id = 34 AND attendance_date = '2026-09-04';

INSERT INTO attendance_sessions (
    utilisateur_id, attendance_date, check_in_time, check_out_time,
    duration_seconds, session_status, source, check_in_source,
    localisation, late_arrival, daily_status,
    worked_minutes, expected_minutes, overtime_minutes, early_leave_minutes,
    auto_closed, overtime_mode, created_at, updated_at, version, entreprise_id
) VALUES (
    34, '2026-09-04'::date,
    '2026-09-04 00:00:00'::timestamp, NULL,
    0, 'CLOSED', 'SYSTEM', 'SYSTEM',
    NULL, FALSE, 'ABSENT',
    0, 480, 0, 480,
    FALSE, 'NONE', NOW(), NOW(), 0, 6
);


-- ─── 3. Anomaly 2: User 37 (MediPlus) – Retard récurrent 10h15+ ────────────
DELETE FROM attendance_sessions
WHERE utilisateur_id = 37 AND attendance_date IN ('2026-09-02', '2026-09-03', '2026-09-04');

INSERT INTO attendance_sessions (
    utilisateur_id, attendance_date, check_in_time, check_out_time,
    duration_seconds, session_status, source, check_in_source, check_out_source,
    localisation, late_arrival, daily_status,
    worked_minutes, expected_minutes, overtime_minutes, early_leave_minutes,
    auto_closed, overtime_mode, created_at, updated_at, version, entreprise_id
) VALUES
-- Mercredi 2 sept
(37, '2026-09-02'::date,
 '2026-09-02 10:18:00'::timestamp, '2026-09-02 17:05:00'::timestamp,
 24420, 'CLOSED', 'WEB', 'WEB', 'WEB',
 'Hôpital MediPlus - Paris', TRUE, 'LATE',
 407, 480, 0, 73,
 FALSE, 'NONE', NOW(), NOW(), 0, 6),
-- Jeudi 3 sept
(37, '2026-09-03'::date,
 '2026-09-03 10:22:00'::timestamp, '2026-09-03 17:10:00'::timestamp,
 24480, 'CLOSED', 'WEB', 'WEB', 'WEB',
 'Hôpital MediPlus - Paris', TRUE, 'LATE',
 408, 480, 0, 72,
 FALSE, 'NONE', NOW(), NOW(), 0, 6),
-- Vendredi 4 sept
(37, '2026-09-04'::date,
 '2026-09-04 10:15:00'::timestamp, '2026-09-04 17:00:00'::timestamp,
 24300, 'CLOSED', 'WEB', 'WEB', 'WEB',
 'Hôpital MediPlus - Paris', TRUE, 'LATE',
 405, 480, 0, 75,
 FALSE, 'NONE', NOW(), NOW(), 0, 6);


-- ─── 4. Anomaly 3: User 63 (TechCorp) – Surheures excessives vendredi ──────
DELETE FROM attendance_sessions
WHERE utilisateur_id = 63 AND attendance_date = '2026-09-04';

INSERT INTO attendance_sessions (
    utilisateur_id, attendance_date, check_in_time, check_out_time,
    duration_seconds, session_status, source, check_in_source, check_out_source,
    localisation, late_arrival, daily_status,
    worked_minutes, expected_minutes, overtime_minutes, early_leave_minutes,
    auto_closed, overtime_mode, created_at, updated_at, version, entreprise_id
) VALUES (
    63, '2026-09-04'::date,
    '2026-09-04 07:00:00'::timestamp, '2026-09-04 21:30:00'::timestamp,
    52200, 'CLOSED', 'WEB', 'WEB', 'WEB',
    'Siège TechCorp - Paris', FALSE, 'WORKING',
    870, 480, 390, 0,
    FALSE, 'NONE', NOW(), NOW(), 0, 5
);


-- ─── 5. Cleanup ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS user_entreprise_map;

COMMIT;
