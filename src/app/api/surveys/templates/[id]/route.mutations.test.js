const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('@/lib/db.js', () => ({ default: dbProxy }));

import { PUT } from '@/app/api/surveys/templates/[id]/route';
import { closeTestDb, createTestDb } from '@/test/integration/api-test-harness';

describe('/api/surveys/templates/:id PUT questions', () => {
  beforeEach(() => { state.db = createTestDb(); });
  afterEach(() => { closeTestDb(state.db); state.db = null; });

  test('updates question text, required state, and answer choices', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
    ).run('Editable', '').lastInsertRowid);
    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, ?, ?, ?)'
    ).run('editable_choice', 'Old question', 'text', 'common', JSON.stringify({ ui_type: 'radio' })).lastInsertRowid);
    state.db.prepare(
      'INSERT INTO form_field (form_id, field_id, display_order, required) VALUES (?, ?, 0, 1)'
    ).run(formId, fieldId);
    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, 0)'
    ).run(fieldId, 'Old', 'Old');

    const res = await PUT(new Request(`http://localhost/api/surveys/templates/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: [{ id: fieldId, question: 'Updated question', required: false, options: ['Yes', 'No'] }],
      }),
    }), { params: Promise.resolve({ id: String(formId) }) });

    expect(res.status).toBe(200);
    expect(state.db.prepare('SELECT field_label FROM field WHERE field_id = ?').get(fieldId))
      .toEqual({ field_label: 'Updated question' });
    expect(state.db.prepare('SELECT required FROM form_field WHERE form_id = ? AND field_id = ?').get(formId, fieldId))
      .toEqual({ required: 0 });
    expect(state.db.prepare('SELECT option_value FROM field_options WHERE field_id = ? ORDER BY display_order').all(fieldId))
      .toEqual([{ option_value: 'Yes' }, { option_value: 'No' }]);
  });

  test('rejects a question that does not belong to the survey', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
    ).run('Editable', '').lastInsertRowid);
    const res = await PUT(new Request(`http://localhost/api/surveys/templates/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [{ id: 999, question: 'Nope' }] }),
    }), { params: Promise.resolve({ id: String(formId) }) });
    expect(res.status).toBe(400);
  });
});
