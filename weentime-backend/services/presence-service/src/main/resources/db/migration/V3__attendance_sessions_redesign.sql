CREATE TABLE attendance_sessions (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL,
    attendance_date DATE NOT NULL,
    check_in_time TIMESTAMP NOT NULL,
    check_out_time TIMESTAMP,
    duration_seconds BIGINT NOT NULL DEFAULT 0,
    session_status VARCHAR(16) NOT NULL,
    source VARCHAR(16) NOT NULL,
    localisation VARCHAR(128),
    late_arrival BOOLEAN NOT NULL DEFAULT FALSE,
    daily_status VARCHAR(16) NOT NULL DEFAULT 'IDLE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0
);

CREATE INDEX idx_attendance_session_user_date
    ON attendance_sessions(utilisateur_id, attendance_date);

CREATE INDEX idx_attendance_session_status
    ON attendance_sessions(session_status);

CREATE INDEX idx_attendance_session_checkin
    ON attendance_sessions(check_in_time);

INSERT INTO attendance_sessions (
    utilisateur_id,
    attendance_date,
    check_in_time,
    check_out_time,
    duration_seconds,
    session_status,
    source,
    localisation,
    late_arrival,
    daily_status,
    created_at,
    updated_at,
    version
)
SELECT
    utilisateur_id,
    date_presence,
    heure_entree,
    heure_sortie,
    COALESCE(CAST(total_heures_travaillees * 3600 AS BIGINT), 0),
    CASE WHEN heure_sortie IS NULL THEN 'OPEN' ELSE 'CLOSED' END,
    source,
    localisation,
    CASE WHEN status = 'LATE' THEN TRUE ELSE FALSE END,
    CASE
        WHEN status = 'LATE' THEN 'LATE'
        WHEN heure_sortie IS NULL THEN 'WORKING'
        ELSE 'IDLE'
    END,
    created_at,
    updated_at,
    version
FROM presences
WHERE heure_entree IS NOT NULL;
