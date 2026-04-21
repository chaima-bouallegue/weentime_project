-- Add invitation code metadata
ALTER TABLE entreprises
    ADD COLUMN code_expiration TIMESTAMP;

ALTER TABLE entreprises
    ADD COLUMN max_users INTEGER DEFAULT 100;

ALTER TABLE entreprises
    ADD COLUMN current_users INTEGER DEFAULT 0;

-- Backfill existing rows
UPDATE entreprises
SET code_expiration = COALESCE(code_expiration, CURRENT_TIMESTAMP + INTERVAL '30' DAY),
    max_users = COALESCE(max_users, 100),
    current_users = COALESCE(current_users, 0);
