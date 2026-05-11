-- Speed up availability checks and conflict detection, which filter by
-- active status and overlapping start/end times on every booking lookup.
CREATE INDEX IF NOT EXISTS idx_bookings_status_time ON bookings(status, starts_at, ends_at);
