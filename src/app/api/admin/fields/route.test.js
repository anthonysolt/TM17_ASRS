const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('../../../../lib/db.js', () => ({ default: dbProxy }));

import { GET, POST, PUT, PATCH, DELETE } from '@/app/api/admin/fields/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
} from '@/test/integration/api-test-harness';

describe('/api/admin/fields integration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    state.db = createTestDb();
    // Insert a test initiative for initiative_specific tests
    state.db.prepare(
      'INSERT INTO initiative (initiative_name, description) VALUES (?, ?)'
    ).run('Test Initiative', 'Test desc');
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('GET returns fields grouped by scope', async () => {
    state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
    ).run('common_field', 'Common Field', 'text', 'common');

    state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope, initiative_id) VALUES (?, ?, ?, ?, ?)'
    ).run('init_field', 'Initiative Field', 'select', 'initiative_specific', 1);

    state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
    ).run('staff_field', 'Staff Field', 'boolean', 'staff_only');

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.common).toHaveLength(1);
    expect(payload.common[0].field_key).toBe('common_field');
    expect(payload.initiative_specific).toHaveLength(1);
    expect(payload.initiative_specific[0].field_key).toBe('init_field');
    expect(payload.staff_only).toHaveLength(1);
    expect(payload.staff_only[0].field_key).toBe('staff_field');
  });

  test('POST creates a common field with validation_rules', async () => {
    const req = new Request('http://localhost:3000/api/admin/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_key: 'age',
        field_label: 'Age',
        field_type: 'number',
        scope: 'common',
        validation_rules: { min: 0, max: 120 },
        is_filterable: true,
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.field_key).toBe('age');
    expect(payload.field_label).toBe('Age');
    expect(payload.field_type).toBe('number');
    expect(payload.scope).toBe('common');
    expect(payload.validation_rules).toEqual({ min: 0, max: 120 });
    expect(payload.is_filterable).toBe(1);

    const dbField = state.db.prepare('SELECT * FROM field WHERE field_key = ?').get('age');
    expect(dbField).toBeTruthy();
    expect(JSON.parse(dbField.validation_rules)).toEqual({ min: 0, max: 120 });
  });

  test('POST creates an initiative-specific field with options', async () => {
    const req = new Request('http://localhost:3000/api/admin/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_key: 'rating_field',
        field_label: 'Rating',
        field_type: 'select',
        scope: 'initiative_specific',
        initiative_id: 1,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.scope).toBe('initiative_specific');
    expect(payload.initiative_id).toBe(1);
    expect(payload.field_options).toHaveLength(3);
    expect(payload.field_options[0].option_value).toBe('low');
    expect(payload.field_options[1].option_value).toBe('medium');
    expect(payload.field_options[2].option_value).toBe('high');
  });

  test('POST rejects initiative_specific without initiative_id (400)', async () => {
    const req = new Request('http://localhost:3000/api/admin/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_key: 'missing_init',
        field_label: 'Missing Initiative',
        field_type: 'text',
        scope: 'initiative_specific',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toMatch(/initiative_id/);
  });

  test('PUT updates a field label and validation_rules', async () => {
    const fieldId = Number(
      state.db.prepare(
        'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
      ).run('update_me', 'Old Label', 'text', 'common').lastInsertRowid
    );

    const req = new Request(`http://localhost:3000/api/admin/fields?fieldId=${fieldId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_label: 'New Label',
        validation_rules: { maxLength: 255 },
      }),
    });

    const res = await PUT(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.field_label).toBe('New Label');
    expect(payload.validation_rules).toEqual({ maxLength: 255 });

    const dbField = state.db.prepare('SELECT * FROM field WHERE field_id = ?').get(fieldId);
    expect(dbField.field_label).toBe('New Label');
    expect(JSON.parse(dbField.validation_rules)).toEqual({ maxLength: 255 });
  });

  test('PATCH removes a question from the core library without deleting it', async () => {
    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope, is_core_question) VALUES (?, ?, ?, ?, 1)'
    ).run('saved_question', 'Saved Question', 'text', 'common').lastInsertRowid);
    const tokens = createSessionForRank(state.db, { rank: 50 });
    const req = new Request(`http://localhost:3000/api/admin/fields?fieldId=${fieldId}`, {
      method: 'PATCH',
      headers: createAuthedRequestHeaders(tokens, { csrf: true }),
    });

    const response = await PATCH(req);
    const field = state.db.prepare(
      'SELECT is_core_question FROM field WHERE field_id = ?'
    ).get(fieldId);

    expect(response.status).toBe(200);
    expect(field.is_core_question).toBe(0);
  });

  test('DELETE removes a field and its options (via cascade)', async () => {
    const fieldId = Number(
      state.db.prepare(
        'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
      ).run('deletable_field', 'Deletable', 'select', 'common').lastInsertRowid
    );

    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
    ).run(fieldId, 'opt1', 'Option 1', 0, fieldId, 'opt2', 'Option 2', 1);

    const req = new Request(`http://localhost:3000/api/admin/fields?fieldId=${fieldId}`, {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);

    const dbField = state.db.prepare('SELECT * FROM field WHERE field_id = ?').get(fieldId);
    expect(dbField).toBeUndefined();

    const dbOptions = state.db.prepare('SELECT * FROM field_options WHERE field_id = ?').all(fieldId);
    expect(dbOptions).toHaveLength(0);
  });

  test('DELETE rejects if field is in use (409)', async () => {
    const formId = Number(
      state.db.prepare(
        'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
      ).run('Test Form', 'A form').lastInsertRowid
    );

    const fieldId = Number(
      state.db.prepare(
        'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
      ).run('used_field', 'Used Field', 'text', 'common').lastInsertRowid
    );

    state.db.prepare(
      'INSERT INTO form_questions (form_id, field_id, display_order) VALUES (?, ?, ?)'
    ).run(formId, fieldId, 0);

    const req = new Request(`http://localhost:3000/api/admin/fields?fieldId=${fieldId}`, {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.usageCount).toBe(1);
  });
});
