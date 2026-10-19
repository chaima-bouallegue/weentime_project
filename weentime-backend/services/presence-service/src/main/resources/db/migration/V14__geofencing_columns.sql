-- ============================================================================
-- V14 : Geofencing columns for attendance sessions
-- Adds location status (IN_ZONE / OUT_OF_ZONE), distance to workplace,
-- and GPS spoofing detection flag for both check-in and check-out.
-- These columns are informational — geofencing never blocks a check-in/out.
-- ============================================================================

ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS check_in_location_status VARCHAR(16),
    ADD COLUMN IF NOT EXISTS check_in_distance_to_workplace BIGINT,
    ADD COLUMN IF NOT EXISTS check_in_gps_spoofing_suspected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS check_out_location_status VARCHAR(16),
    ADD COLUMN IF NOT EXISTS check_out_distance_to_workplace BIGINT,
    ADD COLUMN IF NOT EXISTS check_out_gps_spoofing_suspected BOOLEAN DEFAULT FALSE;

-- Index pour les requêtes RH filtrant par statut de localisation
CREATE INDEX IF NOT EXISTS idx_attendance_checkin_location_status
    ON attendance_sessions (check_in_location_status);
