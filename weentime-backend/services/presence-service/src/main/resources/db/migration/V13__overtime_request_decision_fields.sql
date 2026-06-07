ALTER TABLE overtimes
    ADD COLUMN IF NOT EXISTS overtime_start TIMESTAMP,
    ADD COLUMN IF NOT EXISTS overtime_end TIMESTAMP,
    ADD COLUMN IF NOT EXISTS manager_decision VARCHAR(32),
    ADD COLUMN IF NOT EXISTS manager_comment VARCHAR(500),
    ADD COLUMN IF NOT EXISTS rh_decision VARCHAR(32),
    ADD COLUMN IF NOT EXISTS rh_comment VARCHAR(500);

UPDATE overtimes
SET overtime_start = COALESCE(overtime_start, scheduled_end),
    overtime_end = COALESCE(overtime_end, check_out_time, actual_check_out)
WHERE overtime_minutes IS NOT NULL
  AND overtime_minutes > 0;

UPDATE overtimes
SET status = 'PENDING_MANAGER'
WHERE status IN ('EN_ATTENTE_MANAGER', 'PENDING_APPROVAL');

