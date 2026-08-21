BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field' AND column_name = 'is_reusable'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field' AND column_name = 'is_core_question'
  ) THEN
    ALTER TABLE field RENAME COLUMN is_reusable TO is_core_question;
  END IF;
END $$;

ALTER TABLE field
  ADD COLUMN IF NOT EXISTS is_core_question INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_initiative_specific INTEGER NOT NULL DEFAULT 0;

-- Legacy reusable questions tied to an initiative become initiative questions.
UPDATE field
SET is_core_question = 0,
    is_initiative_specific = 1,
    scope = 'initiative_specific'
WHERE is_core_question = 1
  AND initiative_id IS NOT NULL;

ALTER TABLE field DROP CONSTRAINT IF EXISTS field_is_core_question_check;
ALTER TABLE field DROP CONSTRAINT IF EXISTS field_is_initiative_specific_check;
ALTER TABLE field DROP CONSTRAINT IF EXISTS field_question_classification_check;
ALTER TABLE field DROP CONSTRAINT IF EXISTS field_initiative_question_owner_check;

ALTER TABLE field
  ADD CONSTRAINT field_is_core_question_check CHECK (is_core_question IN (0, 1)),
  ADD CONSTRAINT field_is_initiative_specific_check CHECK (is_initiative_specific IN (0, 1)),
  ADD CONSTRAINT field_question_classification_check CHECK (is_core_question + is_initiative_specific <= 1),
  ADD CONSTRAINT field_initiative_question_owner_check CHECK (is_initiative_specific = 0 OR initiative_id IS NOT NULL);

COMMIT;
