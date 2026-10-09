BEGIN;

-- A goal can source its current value from a survey question. The question is
-- referenced by its root_field_id, so edits to the question keep the link and
-- answers from every revision are included. NULL means the goal is manual.
ALTER TABLE initiative_goal
  ADD COLUMN IF NOT EXISTS source_root_field_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'initiative_goal_source_field_fk'
  ) THEN
    ALTER TABLE initiative_goal
      ADD CONSTRAINT initiative_goal_source_field_fk
      FOREIGN KEY (source_root_field_id) REFERENCES field(field_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'initiative_goal_source_method_check'
  ) THEN
    ALTER TABLE initiative_goal
      ADD CONSTRAINT initiative_goal_source_method_check
      CHECK (source_method IS NULL OR source_method IN ('most_popular', 'average', 'least_common', 'delta_halves', 'linear_slope'));
  END IF;
END $$;

COMMIT;
