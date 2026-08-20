BEGIN;

UPDATE submission_value sv
SET value_number = BTRIM(sv.value_text)::DOUBLE PRECISION,
    value_text = NULL
FROM field f
WHERE f.field_id = sv.field_id
  AND f.field_type IN ('number', 'rating')
  AND sv.value_number IS NULL
  AND sv.value_text IS NOT NULL
  AND BTRIM(sv.value_text) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$';

COMMIT;
