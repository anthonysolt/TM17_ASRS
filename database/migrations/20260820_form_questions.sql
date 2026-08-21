BEGIN;

-- A field is the canonical question. form_questions is the placement of
-- that question on a particular form, including form-specific configuration.
ALTER TABLE form_field RENAME TO form_questions;
ALTER TABLE form_questions RENAME COLUMN form_field_id TO form_question_id;

ALTER TABLE submission_value ADD COLUMN form_question_id INTEGER;

-- Preserve every existing answer by resolving its question placement through
-- the form recorded on the parent submission.
UPDATE submission_value sv
SET form_question_id = fq.form_question_id
FROM submission s
JOIN form_questions fq ON fq.form_id = s.form_id
WHERE s.submission_id = sv.submission_id
  AND fq.field_id = sv.field_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM submission_value WHERE form_question_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate submission values: at least one answer has no matching form question';
  END IF;
END $$;

ALTER TABLE submission_value
  ALTER COLUMN form_question_id SET NOT NULL,
  ADD CONSTRAINT submission_value_form_question_fk
    FOREIGN KEY (form_question_id) REFERENCES form_questions(form_question_id);

ALTER TABLE submission_value DROP COLUMN field_id;
ALTER TABLE submission_value
  ADD CONSTRAINT submission_value_submission_form_question_key
    UNIQUE (submission_id, form_question_id);

CREATE INDEX IF NOT EXISTS idx_form_questions_field ON form_questions(field_id);
CREATE INDEX IF NOT EXISTS idx_submission_value_form_question
  ON submission_value(form_question_id);

COMMIT;
