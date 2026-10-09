BEGIN;

-- root_field_id is the stable identity of a survey question across revisions.
-- Editing a question's text creates a new field snapshot, but the placement
-- keeps the root_field_id of the question it replaced, so every answer to
-- every iteration of the question can be reported together.
ALTER TABLE form_questions ADD COLUMN IF NOT EXISTS root_field_id INTEGER;

-- Revisions made before this migration are treated as separate questions.
UPDATE form_questions
SET root_field_id = field_id
WHERE root_field_id IS NULL;

ALTER TABLE form_questions
  ALTER COLUMN root_field_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_questions_root_field_fk'
  ) THEN
    ALTER TABLE form_questions
      ADD CONSTRAINT form_questions_root_field_fk
      FOREIGN KEY (root_field_id) REFERENCES field(field_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS form_questions_version_root_key
  ON form_questions(form_version_id, root_field_id);
CREATE INDEX IF NOT EXISTS idx_form_questions_root
  ON form_questions(root_field_id);

COMMIT;
