BEGIN;

-- A form_questions row now holds a question's content only (field, required,
-- help text, rules) and is shared by every version where that content is
-- unchanged. form_version_questions says which questions are on each version
-- and in what order, so publishing an edit no longer copies every question.
CREATE TABLE IF NOT EXISTS form_version_questions (
  form_version_id  INTEGER NOT NULL REFERENCES form_version(form_version_id) ON DELETE CASCADE,
  form_question_id INTEGER NOT NULL REFERENCES form_questions(form_question_id) ON DELETE CASCADE,
  display_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form_version_id, form_question_id)
);
CREATE INDEX IF NOT EXISTS idx_form_version_questions_question
  ON form_version_questions(form_question_id);

INSERT INTO form_version_questions (form_version_id, form_question_id, display_order)
SELECT form_version_id, form_question_id, display_order
FROM form_questions
ON CONFLICT DO NOTHING;

-- Merge rows with identical content into the oldest one.
CREATE TEMP TABLE form_question_merge ON COMMIT DROP AS
SELECT form_question_id AS duplicate_id, keep_id
FROM (
  SELECT form_question_id,
         MIN(form_question_id) OVER (
           PARTITION BY form_id, root_field_id, field_id, required, is_hidden, help_text, validation_rules
         ) AS keep_id
  FROM form_questions
) grouped
WHERE form_question_id <> keep_id;

UPDATE form_version_questions fvq
SET form_question_id = m.keep_id
FROM form_question_merge m
WHERE fvq.form_question_id = m.duplicate_id;

-- A submission belongs to one version, so this never collides with the
-- (submission_id, form_question_id) unique key.
UPDATE submission_value sv
SET form_question_id = m.keep_id
FROM form_question_merge m
WHERE sv.form_question_id = m.duplicate_id;

DELETE FROM form_questions fq
USING form_question_merge m
WHERE fq.form_question_id = m.duplicate_id;

-- Dropping the columns also drops the per-version unique indexes and the
-- form_version foreign key.
ALTER TABLE form_questions DROP COLUMN IF EXISTS form_version_id;
ALTER TABLE form_questions DROP COLUMN IF EXISTS display_order;

COMMIT;
