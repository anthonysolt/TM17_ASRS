\set ON_ERROR_STOP on
BEGIN;

DELETE FROM submission
WHERE submission_id BETWEEN 100032 AND 100106
   OR submission_id BETWEEN 110001 AND 110003;

DELETE FROM form
WHERE form_id BETWEEN 100001 AND 100006;

DELETE FROM field
WHERE field_id BETWEEN 100001 AND 100027
   OR field_id BETWEEN 100101 AND 100105;

DELETE FROM "user"
WHERE email LIKE 'mock-submitter-%@example.invalid'
   OR (last_name = 'Mock Esports' AND email IN (
     'tony@tony.com',
     'fake_email@google.com',
     'noemail@test.com'
   ));

DELETE FROM app_settings WHERE key = 'mock_data_imported';

COMMIT;
