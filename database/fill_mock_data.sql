\set ON_ERROR_STOP on
BEGIN;

-- Reserved IDs make this import deterministic and safely removable:
-- forms 100001-100006, fields 100001-100027 and 100101-100105,
-- submissions 100032-100106 and 110001-110003.

CREATE TEMP TABLE mock_submissions_csv (
  row_number INTEGER GENERATED ALWAYS AS IDENTITY,
  initiative_id INTEGER,
  form_id INTEGER,
  submitted_at TEXT,
  submitted_by_user_id INTEGER
);

CREATE TEMP TABLE mock_values_csv (
  submission_id INTEGER,
  field_id INTEGER,
  value_text TEXT,
  value_number REAL
);

CREATE TEMP TABLE esports_csv (
  source_id INTEGER,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  school TEXT,
  experience_rating TEXT,
  activity_rating TEXT,
  attendance_likelihood TEXT,
  favorite_course TEXT
);

\copy mock_submissions_csv (initiative_id, form_id, submitted_at, submitted_by_user_id) FROM 'mock-data/submissions.csv' WITH (FORMAT csv, HEADER true)
\copy mock_values_csv FROM 'mock-data/submission_values.csv' WITH (FORMAT csv, HEADER true)
\copy esports_csv FROM 'mock-data/Esports_Report.csv' WITH (FORMAT csv, HEADER true)

CREATE TEMP TABLE mock_submission_map AS
SELECT
  submissions.*,
  31 + ((initiative_id - 1) * 15)
    + ROW_NUMBER() OVER (PARTITION BY initiative_id ORDER BY row_number) AS source_submission_id
FROM mock_submissions_csv submissions;

-- Fail early if the canonical initiatives required by the CSV are absent.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM initiative WHERE initiative_id BETWEEN 1 AND 5) <> 5 THEN
    RAISE EXCEPTION 'Mock import requires initiatives 1 through 5';
  END IF;
END $$;

-- Placeholder accounts preserve submitted_by_user_id relationships without
-- colliding with real user IDs. Their external CSV IDs remain in the email.
INSERT INTO "user" (first_name, last_name, email, password, user_type_id, verified)
SELECT
  'Mock',
  'Submitter ' || source_user_id,
  'mock-submitter-' || source_user_id || '@example.invalid',
  'mock-data-account-disabled',
  (SELECT user_type_id FROM user_type WHERE type = 'public'),
  1
FROM (
  SELECT DISTINCT submitted_by_user_id AS source_user_id
  FROM mock_submissions_csv
) source_users
ON CONFLICT (email) DO NOTHING;

-- Isolated forms and fields avoid changing real form definitions or relying on
-- the database's current identity values.
INSERT INTO form (form_id, initiative_id, form_name, description, is_published)
SELECT DISTINCT
  100000 + form_id,
  initiative_id,
  'Mock CSV Form ' || form_id,
  'Imported by database/fill_mock_data.sql',
  0
FROM mock_submissions_csv
ON CONFLICT (form_id) DO NOTHING;

INSERT INTO field (field_id, field_key, field_label, field_type, scope, is_filterable)
SELECT
  100000 + field_id,
  'mock_csv_field_' || field_id,
  'Mock CSV Field ' || field_id,
  CASE WHEN BOOL_OR(value_number IS NOT NULL) THEN 'number' ELSE 'text' END,
  'common',
  1
FROM mock_values_csv
GROUP BY field_id
ON CONFLICT (field_id) DO NOTHING;

INSERT INTO form_field (form_id, field_id, display_order)
SELECT DISTINCT
  100000 + submissions.form_id,
  100000 + values.field_id,
  values.field_id
FROM mock_values_csv values
JOIN mock_submission_map submissions
  ON values.submission_id = submissions.source_submission_id
ON CONFLICT (form_id, field_id) DO NOTHING;

INSERT INTO submission (
  submission_id,
  initiative_id,
  form_id,
  submitted_at,
  submitted_by_user_id
)
SELECT
  100000 + source_submission_id,
  initiative_id,
  100000 + form_id,
  submitted_at,
  users.user_id
FROM mock_submission_map submissions
JOIN "user" users
  ON users.email = 'mock-submitter-' || submissions.submitted_by_user_id || '@example.invalid'
ON CONFLICT (submission_id) DO NOTHING;

-- submission_values.csv contains one value set (source submission 61) for
-- which submissions.csv has no metadata row. Retain it as an anonymous mock
-- submission, inferred from the CSV's fixed 15-row initiative blocks.
INSERT INTO submission (submission_id, initiative_id, form_id, submitted_at, submitted_by_user_id)
SELECT DISTINCT
  100000 + values.submission_id,
  ((values.submission_id - 32) / 15) + 1,
  100000 + (((values.submission_id - 32) / 15) + 1),
  CURRENT_TIMESTAMP::text,
  NULL::INTEGER
FROM mock_values_csv values
LEFT JOIN mock_submission_map submissions
  ON submissions.source_submission_id = values.submission_id
WHERE submissions.source_submission_id IS NULL
ON CONFLICT (submission_id) DO NOTHING;

INSERT INTO submission_value (
  submission_id,
  field_id,
  value_text,
  value_number
)
SELECT
  100000 + submission_id,
  100000 + field_id,
  NULLIF(value_text, ''),
  value_number
FROM mock_values_csv
ON CONFLICT (submission_id, field_id) DO NOTHING;

-- Esports_Report.csv is represented as a separate E-Gaming form.
INSERT INTO form (form_id, initiative_id, form_name, description, is_published)
VALUES (100006, 5, 'Esports Report Mock Form', 'Imported from Esports_Report.csv', 0)
ON CONFLICT (form_id) DO NOTHING;

INSERT INTO field (field_id, field_key, field_label, field_type, scope, initiative_id, is_filterable)
VALUES
  (100101, 'mock_esports_school', 'School', 'text', 'initiative_specific', 5, 1),
  (100102, 'mock_esports_experience_rating', 'How would you rate your experience with this activity', 'text', 'initiative_specific', 5, 1),
  (100103, 'mock_esports_activity_rating', 'Please rate your experience with this activity', 'number', 'initiative_specific', 5, 1),
  (100104, 'mock_esports_attendance_likelihood', 'On a scale of 1 to 10, how likely are you to attend this event', 'number', 'initiative_specific', 5, 1),
  (100105, 'mock_esports_favorite_course', 'Please list your favorite course', 'text', 'initiative_specific', 5, 1)
ON CONFLICT (field_id) DO NOTHING;

INSERT INTO form_field (form_id, field_id, display_order)
VALUES
  (100006, 100101, 0),
  (100006, 100102, 1),
  (100006, 100103, 2),
  (100006, 100104, 3),
  (100006, 100105, 4)
ON CONFLICT (form_id, field_id) DO NOTHING;

INSERT INTO "user" (first_name, last_name, email, password, phone_number, user_type_id, verified)
SELECT
  full_name,
  'Mock Esports',
  LOWER(email),
  'mock-data-account-disabled',
  phone,
  (SELECT user_type_id FROM user_type WHERE type = 'public'),
  1
FROM esports_csv
ON CONFLICT (email) DO NOTHING;

INSERT INTO submission (submission_id, initiative_id, form_id, submitted_at, submitted_by_user_id)
SELECT
  110000 + source_id,
  5,
  100006,
  CURRENT_TIMESTAMP::text,
  users.user_id
FROM esports_csv esports
JOIN "user" users ON users.email = LOWER(esports.email)
ON CONFLICT (submission_id) DO NOTHING;

INSERT INTO submission_value (submission_id, field_id, value_text, value_number)
SELECT 110000 + source_id, field_id, value_text, value_number
FROM esports_csv
CROSS JOIN LATERAL (VALUES
  (100101, NULLIF(school, ''), NULL::REAL),
  (100102, NULLIF(experience_rating, ''), NULL::REAL),
  (100103, NULL, NULLIF(activity_rating, '')::REAL),
  (100104, NULL, NULLIF(attendance_likelihood, '')::REAL),
  (100105, NULLIF(favorite_course, ''), NULL::REAL)
) values_to_insert(field_id, value_text, value_number)
WHERE value_text IS NOT NULL OR value_number IS NOT NULL
ON CONFLICT (submission_id, field_id) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('mock_data_imported', CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

COMMIT;
