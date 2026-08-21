const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('@/lib/db.js', () => ({ default: dbProxy }));

import { PUT } from '@/app/api/surveys/templates/[id]/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
} from '@/test/integration/api-test-harness';

describe('/api/surveys/templates/:id PUT question editing', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    state.db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  test('updates question text, required state, and answer options', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, is_published) VALUES (1, ?, 1)'
    ).run('Editable Survey').lastInsertRowid);
    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
    ).run('editable_choice', 'Old question?', 'choice', 'common').lastInsertRowid);
    state.db.prepare(
      'INSERT INTO form_questions (form_id, field_id, display_order, required) VALUES (?, ?, 0, 1)'
    ).run(formId, fieldId);
    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, 0)'
    ).run(fieldId, 'Old', 'Old');

    const tokens = createSessionForRank(state.db, { rank: 50 });
    const request = new Request(`http://localhost:3000/api/surveys/templates/${formId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({
        questions: [{
          id: fieldId,
          question: 'Updated question?',
          type: 'radio',
          required: false,
          options: ['Yes', 'No'],
        }],
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(formId) }) });
    const field = state.db.prepare(
      'SELECT field_label, field_type, validation_rules FROM field WHERE field_id = ?'
    ).get(fieldId);
    const placement = state.db.prepare(
      'SELECT required FROM form_questions WHERE form_id = ? AND field_id = ?'
    ).get(formId, fieldId);
    const options = state.db.prepare(
      'SELECT option_value FROM field_options WHERE field_id = ? ORDER BY display_order'
    ).all(fieldId).map(option => option.option_value);

    expect(response.status).toBe(200);
    expect(field.field_label).toBe('Updated question?');
    expect(field.field_type).toBe('text');
    expect(JSON.parse(field.validation_rules).ui_type).toBe('radio');
    expect(placement.required).toBe(0);
    expect(options).toEqual(['Yes', 'No']);
  });
});
