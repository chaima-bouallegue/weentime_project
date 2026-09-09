-- Script de synchronisation des données de seed entre la table 'presences' et 'attendance_sessions' dans presence_db

CREATE TEMP TABLE IF NOT EXISTS user_entreprise_map (
    user_id BIGINT PRIMARY KEY,
    entreprise_id BIGINT
);

INSERT INTO user_entreprise_map (user_id, entreprise_id) VALUES
(2, 1), (3, 1), (4, 1),
(6, 2), (7, 2), (8, 2), (9, 2), (10, 2), (11, 2), (14, 2), (15, 2), (16, 2), (17, 2), (19, 2), (20, 2), (23, 2), (27, 2),
(12, 3), (13, 4),
(30, 5), (51, 5), (52, 5), (53, 5), (54, 5), (55, 5), (56, 5), (57, 5), (58, 5), (59, 5), (60, 5), (61, 5), (62, 5), (63, 5), (64, 5), (65, 5), (66, 5), (67, 5), (68, 5), (69, 5), (70, 5), (71, 5), (72, 5), (73, 5), (74, 5), (75, 5), (76, 5), (77, 5),
(28, 6), (31, 6), (32, 6), (33, 6), (34, 6), (35, 6), (36, 6), (37, 6), (38, 6), (39, 6), (40, 6), (41, 6), (42, 6), (43, 6), (44, 6), (45, 6), (46, 6), (47, 6), (48, 6), (49, 6), (50, 6),
(29, 7), (78, 7), (79, 7), (80, 7), (81, 7), (82, 7), (83, 7), (84, 7), (85, 7), (86, 7), (87, 7), (88, 7), (89, 7), (90, 7), (91, 7), (92, 7), (93, 7), (94, 7), (95, 7), (96, 7), (97, 7), (98, 7)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO attendance_sessions (
    utilisateur_id,
    attendance_date,
    check_in_time,
    check_out_time,
    duration_seconds,
    session_status,
    source,
    check_in_source,
    check_out_source,
    localisation,
    late_arrival,
    daily_status,
    worked_minutes,
    expected_minutes,
    overtime_minutes,
    early_leave_minutes,
    auto_closed,
    overtime_mode,
    created_at,
    updated_at,
    version,
    entreprise_id
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
    CASE WHEN p.status = 'LATE' THEN TRUE ELSE FALSE END,
    CASE
        WHEN p.status = 'LATE' THEN 'LATE'
        WHEN p.status = 'PRESENT' THEN 'WORKING'
        WHEN p.status = 'REMOTE' THEN 'REMOTE'
        WHEN p.status = 'LEAVE' OR p.status = 'ON_LEAVE' THEN 'HOLIDAY'
        WHEN p.status = 'ABSENT' THEN 'ABSENT'
        ELSE 'WORKING'
    END,
    COALESCE(
        CAST(p.total_heures_travaillees * 60 AS INTEGER),
        CASE WHEN p.heure_sortie IS NOT NULL AND p.heure_entree IS NOT NULL 
             THEN CAST(EXTRACT(EPOCH FROM (p.heure_sortie - p.heure_entree))/60 AS INTEGER)
             ELSE 0 END
    ),
    480,
    0,
    0,
    FALSE,
    'NONE',
    p.created_at,
    p.updated_at,
    COALESCE(p.version, 0),
    COALESCE(m.entreprise_id, 2)
FROM presences p
LEFT JOIN user_entreprise_map m ON m.user_id = p.utilisateur_id
WHERE NOT EXISTS (
    SELECT 1 FROM attendance_sessions a 
    WHERE a.utilisateur_id = p.utilisateur_id AND a.attendance_date = p.date_presence
);
