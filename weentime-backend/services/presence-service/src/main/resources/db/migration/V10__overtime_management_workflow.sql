ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMP;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS worked_minutes INTEGER;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS expected_minutes INTEGER;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS reviewed_by BIGINT;
ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

UPDATE overtimes
SET status = CASE
    WHEN status = 'PENDING_APPROVAL' THEN 'EN_ATTENTE_MANAGER'
    WHEN status = 'APPROVED' THEN 'APPROUVEE_MANAGER'
    WHEN status = 'REJECTED' THEN 'REFUSEE_MANAGER'
    WHEN status IS NULL AND approuvee = TRUE THEN 'APPROUVEE_MANAGER'
    WHEN status IS NULL THEN 'EN_ATTENTE_MANAGER'
    ELSE status
END;

UPDATE overtimes
SET overtime_minutes = COALESCE(overtime_minutes, CAST(heures_supplementaires * 60 AS INTEGER));

CREATE INDEX IF NOT EXISTS idx_overtime_attendance
    ON overtimes(attendance_id);

CREATE INDEX IF NOT EXISTS idx_overtime_user_month
    ON overtimes(utilisateur_id, date_presence);
