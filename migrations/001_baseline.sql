-- Baseline migration. The "live" schema currently lives in src/db.js using
-- CREATE TABLE IF NOT EXISTS, so existing deployments are unaffected by
-- this empty baseline. From here forward, schema changes go in numbered
-- .sql files in this folder and get applied at server startup.
SELECT 1;
