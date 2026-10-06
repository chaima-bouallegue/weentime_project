-- ==============================================================================
-- Seed Script: Données de Présence Démo pour le Calendrier Global
-- Base de données : presence_db
-- Entreprise      : IT Serv (ID: 2)
-- Employés        : 23 (Assia), 11 (Firas), 14 (Marwa), 9 (Hayet), 17 (Yahya), 10 (Molka)
-- ==============================================================================

DO $$
DECLARE
    dates date[] := ARRAY[
        '2026-09-01'::date,
        '2026-09-02'::date,
        '2026-09-03'::date,
        '2026-09-04'::date,
        '2026-09-07'::date,
        '2026-09-08'::date,
        '2026-09-09'::date,
        '2026-09-10'::date,
        '2026-09-11'::date,
        '2026-09-14'::date,
        '2026-09-15'::date
    ];
    cur_date date;
    u_id bigint;
    u_ids bigint[] := ARRAY[23, 11, 14, 9, 17, 10];
    check_in timestamp;
    check_out timestamp;
    dur bigint;
BEGIN
    FOREACH cur_date IN ARRAY dates LOOP
        FOREACH u_id IN ARRAY u_ids LOOP
            -- Ignorer si l'employé est en congé ou télétravail ce jour-là (géré par rh_db)
            -- 03/09 & 04/09: Hayet en congé
            IF (u_id = 9 AND cur_date IN ('2026-09-03', '2026-09-04')) THEN
                CONTINUE;
            END IF;
            -- 08/09: Assia en télétravail
            IF (u_id = 23 AND cur_date = '2026-09-08') THEN
                CONTINUE;
            END IF;
            -- 11/09: Firas en télétravail
            IF (u_id = 11 AND cur_date = '2026-09-11') THEN
                CONTINUE;
            END IF;

            -- Générer un pointage réaliste (arrivée entre 08h45 et 09h05, départ entre 17h30 et 18h00)
            check_in := cur_date + time '08:50:00' + ((u_id * 73) % 15 || ' minutes')::interval;
            check_out := cur_date + time '17:40:00' + ((u_id * 47) % 20 || ' minutes')::interval;
            dur := EXTRACT(EPOCH FROM (check_out - check_in))::bigint;

            -- Ne pas dupliquer si déjà présent
            IF NOT EXISTS (
                SELECT 1 FROM attendance_sessions 
                WHERE utilisateur_id = u_id AND attendance_date = cur_date
            ) THEN
                INSERT INTO attendance_sessions (
                    utilisateur_id, attendance_date, check_in_time, check_out_time,
                    duration_seconds, session_status, daily_status, source, entreprise_id,
                    worked_minutes, expected_minutes, overtime_mode, late_arrival, auto_closed
                ) VALUES (
                    u_id, cur_date, check_in, check_out,
                    dur, 'CLOSED', 'PRESENT', 'WEB', 2,
                    480, 480, 'NONE', false, false
                );
            END IF;
        END LOOP;
    END LOOP;

    -- Aujourd'hui (16/09/2026) : Pointer les autres collaborateurs pour la journée en cours
    FOREACH u_id IN ARRAY ARRAY[11, 14, 9, 17, 10] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM attendance_sessions 
            WHERE utilisateur_id = u_id AND attendance_date = '2026-09-16'
        ) THEN
            check_in := '2026-09-16 08:52:00'::timestamp + ((u_id * 31) % 12 || ' minutes')::interval;
            INSERT INTO attendance_sessions (
                utilisateur_id, attendance_date, check_in_time, check_out_time,
                duration_seconds, session_status, daily_status, source, entreprise_id,
                worked_minutes, expected_minutes, overtime_mode, late_arrival, auto_closed
            ) VALUES (
                u_id, '2026-09-16', check_in, NULL,
                0, 'OPEN', 'WORKING', 'WEB', 2,
                0, 480, 'NONE', false, false
            );
        END IF;
    END LOOP;

END $$;
