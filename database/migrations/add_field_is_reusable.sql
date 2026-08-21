BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'field'
      AND column_name = 'is_reusable'
  ) THEN
    ALTER TABLE field ADD COLUMN is_reusable INTEGER NOT NULL DEFAULT 0;

    -- Preserve questions shown in the legacy Saved Questions tab.
    UPDATE field SET is_reusable = 1;
  END IF;
END $$;

COMMIT;
