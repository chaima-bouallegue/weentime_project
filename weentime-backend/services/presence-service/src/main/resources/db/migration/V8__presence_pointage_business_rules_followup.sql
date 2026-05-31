ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS entreprise_id BIGINT,
    ADD COLUMN IF NOT EXISTS schedule_id BIGINT,
    ADD COLUMN IF NOT EXISTS check_in_source VARCHAR(16),
    ADD COLUMN IF NOT EXISTS check_out_source VARCHAR(16),
    ADD COLUMN IF NOT EXISTS check_in_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_accuracy DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_address VARCHAR(255),
    ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_accuracy DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_address VARCHAR(255),
    ADD COLUMN IF NOT EXISTS worked_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS expected_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auto_closed_reason VARCHAR(128),
    ADD COLUMN IF NOT EXISTS latest_alert VARCHAR(64);

UPDATE attendance_sessions
SET check_in_source = COALESCE(check_in_source, source),
    worked_minutes = COALESCE(worked_minutes, CAST(duration_seconds / 60 AS INTEGER)),
    auto_closed = COALESCE(auto_closed, FALSE)
WHERE check_in_source IS NULL
   OR worked_minutes IS NULL
   OR auto_closed IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_session_enterprise_date
    ON attendance_sessions(entreprise_id, attendance_date);

ALTER TABLE overtimes
    ADD COLUMN IF NOT EXISTS entreprise_id BIGINT,
    ADD COLUMN IF NOT EXISTS attendance_id BIGINT,
    ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMP,
    ADD COLUMN IF NOT EXISTS actual_check_out TIMESTAMP,
    ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS reason VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
    ADD COLUMN IF NOT EXISTS manager_id BIGINT,
    ADD COLUMN IF NOT EXISTS rh_decision_by BIGINT;

UPDATE overtimes
SET overtime_minutes = COALESCE(overtime_minutes, CAST(heures_supplementaires * 60 AS INTEGER)),
    status = CASE
        WHEN approuvee = TRUE THEN 'APPROVED'
        WHEN status IS NULL THEN 'PENDING_APPROVAL'
        ELSE status
    END;

CREATE INDEX IF NOT EXISTS idx_overtime_enterprise_status
    ON overtimes(entreprise_id, status);
