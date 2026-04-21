ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN;

UPDATE notifications
SET is_read = CASE
    WHEN status = 'READ' THEN TRUE
    ELSE FALSE
END
WHERE is_read IS NULL;

ALTER TABLE notifications
    ALTER COLUMN is_read SET DEFAULT FALSE;

UPDATE notifications
SET is_read = FALSE
WHERE is_read IS NULL;

ALTER TABLE notifications
    ALTER COLUMN is_read SET NOT NULL;

DROP INDEX IF EXISTS idx_notifications_status;
DROP INDEX IF EXISTS idx_notifications_user_status_created;

CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC);

ALTER TABLE notifications
    DROP COLUMN IF EXISTS status;
