BEGIN;

-- Canonical initiative identifiers. Existing rows are temporarily renamed so
-- the unique name constraint cannot interfere while the ID mapping changes.
UPDATE initiative
SET initiative_name = '__initiative_seed_' || initiative_id::text
WHERE initiative_id BETWEEN 1 AND 8;

INSERT INTO initiative (initiative_id, initiative_name) VALUES
  (1, 'Robotic'),
  (2, 'Bags2School'),
  (3, 'ELA Awards'),
  (4, 'Teacher Proposals'),
  (5, 'E-Gaming & Careers'),
  (6, 'Sporting Activities'),
  (7, 'Product Reimaging'),
  (8, 'Work force Readiness')
ON CONFLICT (initiative_id) DO UPDATE
SET initiative_name = EXCLUDED.initiative_name;

-- Keep future identity-generated initiatives above the explicitly assigned IDs.
SELECT setval(
  pg_get_serial_sequence('initiative', 'initiative_id'),
  GREATEST((SELECT MAX(initiative_id) FROM initiative), 8),
  true
);

INSERT INTO user_type (type, access_rank) VALUES
  ('public', 10),
  ('staff', 50),
  ('admin', 100)
ON CONFLICT (type) DO UPDATE SET access_rank = EXCLUDED.access_rank;

INSERT INTO permission (key, label) VALUES
  ('surveys.take', 'Take Surveys'),
  ('initiatives.manage', 'Initiatives'),
  ('reporting.view', 'Reporting'),
  ('reports.create', 'Report Creation'),
  ('forms.create', 'Form Creation'),
  ('surveys.distribute', 'Survey Distribution'),
  ('goals.manage', 'Goals & Scoring'),
  ('performance.view', 'Performance Dashboard'),
  ('budgets.manage', 'Budget Reporting'),
  ('conflicts.manage', 'Data Conflicts'),
  ('users.manage', 'User Management'),
  ('audit.view', 'Audit Logs'),
  ('import.manage', 'Data Import')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO role_permission (user_type_id, permission_id)
SELECT ut.user_type_id, p.permission_id
FROM user_type ut CROSS JOIN permission p
WHERE ut.type = 'admin'
   OR (ut.type = 'staff' AND p.key IN (
     'surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create',
     'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view'
   ))
   OR (ut.type = 'public' AND p.key IN ('surveys.take', 'reporting.view'))
ON CONFLICT (user_type_id, permission_id) DO NOTHING;

INSERT INTO feature (key, name, description) VALUES
  ('FORM_VIEW', 'View Forms', 'View and fill out forms'),
  ('FORM_EDIT', 'Edit Forms', 'Create and edit form definitions'),
  ('REPORT_VIEW', 'View Reports', 'View generated reports'),
  ('REPORT_CREATE_DEFAULT', 'Create Reports', 'Create and run report templates'),
  ('ADMIN_USERS', 'Manage Users', 'Manage user accounts and permissions'),
  ('GOAL_MANAGE', 'Manage Goals', 'Set and manage initiative goals with scoring criteria'),
  ('REPORT_MANAGE', 'Manage Reports', 'Add, update, delete, and reorder reports')
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO feature_access (feature_id, min_access_rank)
SELECT feature_id,
  CASE key
    WHEN 'FORM_VIEW' THEN 1
    WHEN 'REPORT_VIEW' THEN 10
    WHEN 'FORM_EDIT' THEN 50
    WHEN 'REPORT_CREATE_DEFAULT' THEN 50
    WHEN 'REPORT_MANAGE' THEN 50
    ELSE 100
  END
FROM feature
ON CONFLICT (feature_id) DO UPDATE
SET min_access_rank = EXCLUDED.min_access_rank;

-- Password: temporary1!
-- This is an application-compatible scrypt hash; plaintext is never stored.
INSERT INTO "user" (first_name, last_name, email, password, user_type_id, verified)
SELECT 'System', 'Administrator', 'admin@test.com',
  'scrypt$16384$8$1$49e6b5a71bc065905e3ebf3f829dc791$4ebf5ef23171ec6811e8b4340ce391d0ef6b05b3c8846b48e970da78103462779748dcb6f03c4f7469daacac919b0326507951877892ecc15bcea94df5f3391d',
  user_type_id, 1
FROM user_type
WHERE type = 'admin'
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password,
    user_type_id = EXCLUDED.user_type_id,
    verified = 1,
    verification_token = NULL,
    token_expires_at = NULL;

COMMIT;
