BEGIN;

-- When a report was last moved into the 'published' status. Re-publishing an
-- archived report resets it to the time of that change.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS published_at TEXT;

UPDATE reports
SET published_at = created_at
WHERE status = 'published' AND published_at IS NULL;

COMMIT;
