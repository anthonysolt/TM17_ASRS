-- Speeds up per-form question lineage lookups (a form's placements of one
-- question across versions), used when retiring questions and counting the
-- answers they keep.
CREATE INDEX IF NOT EXISTS idx_form_questions_form_root ON form_questions(form_id, root_field_id);
