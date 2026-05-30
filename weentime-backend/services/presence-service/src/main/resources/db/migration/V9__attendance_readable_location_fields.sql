ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_in_city VARCHAR(128);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_in_region VARCHAR(128);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_in_country VARCHAR(128);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_out_city VARCHAR(128);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_out_region VARCHAR(128);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS check_out_country VARCHAR(128);
