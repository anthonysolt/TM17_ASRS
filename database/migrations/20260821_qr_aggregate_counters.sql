BEGIN;

ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS qr_viewcount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS qr_conversion INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'qr_scans'
  ) THEN
    UPDATE qr_codes q
    SET qr_viewcount = totals.view_count,
        qr_conversion = totals.conversion_count
    FROM (
      SELECT qr_code_id,
             COUNT(*) FILTER (WHERE converted_to_submission IS DISTINCT FROM 1) AS view_count,
             COUNT(*) FILTER (WHERE converted_to_submission = 1) AS conversion_count
      FROM qr_scans
      GROUP BY qr_code_id
    ) totals
    WHERE q.qr_code_id = totals.qr_code_id;

    DROP TABLE qr_scans;
  END IF;
END $$;

COMMIT;
