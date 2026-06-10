DROP INDEX IF EXISTS uk_overtime_attendance_session;

CREATE UNIQUE INDEX uk_overtime_attendance_session
    ON overtimes(attendance_id);
