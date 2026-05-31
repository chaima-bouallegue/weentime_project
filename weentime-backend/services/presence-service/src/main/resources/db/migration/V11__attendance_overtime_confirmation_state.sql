ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS overtime_mode VARCHAR(32) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS overtime_started_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS overtime_confirmed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS overtime_confirmation_shown_at TIMESTAMP;

UPDATE attendance_sessions
SET overtime_mode = 'FINISHED'
WHERE check_out_time IS NOT NULL
  AND (overtime_mode IS NULL OR overtime_mode = 'NONE');

UPDATE attendance_sessions
SET overtime_mode = 'NONE'
WHERE overtime_mode IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_overtime_attendance_session
    ON overtimes(attendance_id)
    WHERE attendance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_overtime_enterprise_status_date
    ON overtimes(entreprise_id, status, date_presence);

CREATE INDEX IF NOT EXISTS idx_overtime_manager_status_date
    ON overtimes(manager_id, status, date_presence);
