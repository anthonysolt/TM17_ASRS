-- Survey responses are stored only in submission / submission_value.
--
-- The `surveys` table held a second copy of every response as JSON, plus a
-- placeholder name ("Anonymous") and email. The app no longer reads or writes
-- it: responses are identified by submission.submission_id. This migration
-- removes the table and the unused reports.survey_id link to it.
--
-- Safety check: every surveys row must have a matching submission (saved
-- within 5 seconds of it). If any row has none, its answers exist only in
-- surveys, so the migration stops instead of deleting them.
BEGIN;

DO $$
DECLARE
  unmatched integer;
BEGIN
  IF to_regclass('surveys') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO unmatched
  FROM surveys sv
  WHERE NOT EXISTS (
    SELECT 1 FROM submission s
    WHERE abs(extract(epoch FROM (s.submitted_at::timestamptz - sv.submitted_at::timestamptz))) < 5
  );

  IF unmatched > 0 THEN
    RAISE EXCEPTION
      '% row(s) in surveys have no matching submission; their answers would be lost. Back them up or move them to submission before running this migration.',
      unmatched;
  END IF;
END $$;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_survey_id_fkey;
DROP INDEX IF EXISTS idx_reports_survey_id;
ALTER TABLE reports DROP COLUMN IF EXISTS survey_id;

DROP INDEX IF EXISTS idx_surveys_submitted_at;
DROP TABLE IF EXISTS surveys;

COMMIT;
