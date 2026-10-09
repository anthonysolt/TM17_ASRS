const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('../../../../lib/db.js', () => ({
  default: dbProxy,
}));

import { GET, POST, DELETE } from '@/app/api/surveys/templates/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
} from '@/test/integration/api-test-harness';

describe('/api/surveys/templates integration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    state.db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('GET returns published templates with question options', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
    ).run('Student Pulse', 'weekly check-in').lastInsertRowid);
    const versionId = Number(state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid);

    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)' 
    ).run('pulse_1', 'How are you?', 'choice', 'common').lastInsertRowid);

    state.db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required, help_text) VALUES (?, ?, ?, 0, 1, ?)'
    ).run(formId, versionId, fieldId, 'Select one');

    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
    ).run(fieldId, 'good', 'Good', 0, fieldId, 'bad', 'Bad', 1);

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0].questions[0].text.options).toEqual(['good', 'bad']);
  });

  test('POST returns 401 without auth in non-test env', async () => {
    process.env.NODE_ENV = 'development';

    const req = new Request('http://localhost:3000/api/surveys/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Auth', questions: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('POST validates payload and persists form/fields/options', async () => {
    process.env.NODE_ENV = 'development';
    const tokens = createSessionForRank(state.db, { rank: 100 });

    const invalidReq = new Request('http://localhost:3000/api/surveys/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({ title: '', questions: 'x' }),
    });
    expect((await POST(invalidReq)).status).toBe(400);

    const validReq = new Request('http://localhost:3000/api/surveys/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({
        title: 'Readiness Survey',
        description: 'A readiness template',
        questions: [
          { text: { question: 'Q1', type: 'choice', required: true, is_core_question: true, options: ['yes', 'no'] } },
          { text: { question: 'Q2', type: 'text', required: false } },
        ],
      }),
    });

    const res = await POST(validReq);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.title).toBe('Readiness Survey');

    const formCount = state.db.prepare('SELECT COUNT(*) AS c FROM form WHERE form_name = ?').get('Readiness Survey').c;
    const fieldCount = state.db.prepare('SELECT COUNT(*) AS c FROM field').get().c;
    const optionCount = state.db.prepare('SELECT COUNT(*) AS c FROM field_options').get().c;
    const reusableQuestion = state.db.prepare(
      'SELECT is_core_question, field_type, validation_rules FROM field WHERE field_label = ?'
    ).get('Q1');

    expect(formCount).toBe(1);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form_version WHERE form_id = ?').get(payload.id).c).toBe(1);
    expect(fieldCount).toBe(2);
    expect(optionCount).toBe(2);
    expect(reusableQuestion.is_core_question).toBe(1);
    expect(reusableQuestion.field_type).toBe('text');
    expect(JSON.parse(reusableQuestion.validation_rules).ui_type).toBe('choice');
  });

  test('POST reuses a core question and its options without duplicating either', async () => {
    process.env.NODE_ENV = 'development';
    const tokens = createSessionForRank(state.db, { rank: 100 });
    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope, is_core_question, validation_rules) VALUES (?, ?, ?, ?, 1, ?)'
    ).run('shared_choice', 'Shared choice', 'text', 'common', JSON.stringify({ ui_type: 'choice' })).lastInsertRowid);
    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, 0), (?, ?, ?, 1)'
    ).run(fieldId, 'yes', 'Yes', fieldId, 'no', 'No');

    for (const title of ['Form A', 'Form B']) {
      const response = await POST(new Request('http://localhost:3000/api/surveys/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthedRequestHeaders(tokens, { csrf: true }),
        },
        body: JSON.stringify({
          title,
          initiative_id: 1,
          questions: [{ field_id: fieldId, question: 'Shared choice', type: 'choice', options: ['yes', 'no'] }],
        }),
      }));
      expect(response.status).toBe(201);
    }

    expect(state.db.prepare('SELECT COUNT(*) AS c FROM field WHERE field_id = ?').get(fieldId).c).toBe(1);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM field_options WHERE field_id = ?').get(fieldId).c).toBe(2);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form_questions WHERE field_id = ?').get(fieldId).c).toBe(2);
  });

  test('POST stores Likert labels with numeric option values and a numeric field type', async () => {
    process.env.NODE_ENV = 'development';
    const tokens = createSessionForRank(state.db, { rank: 100 });
    const response = await POST(new Request('http://localhost:3000/api/surveys/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({
        title: 'Likert Survey',
        initiative_id: 1,
        questions: [{
          question: 'How much do you agree?',
          type: 'likert_agreement',
          required: true,
          options: ['Strongly Disagree', 'Disagree', 'Some What Disagree', 'Neutral', 'Some What Agree', 'Agree', 'Strongly Agree'],
        }],
      }),
    }));

    expect(response.status).toBe(201);
    const field = state.db.prepare('SELECT field_id, field_type, validation_rules FROM field WHERE field_label = ?').get('How much do you agree?');
    expect(field.field_type).toBe('number');
    expect(JSON.parse(field.validation_rules).ui_type).toBe('likert_agreement');
    expect(state.db.prepare(
      'SELECT option_value, display_label FROM field_options WHERE field_id = ? ORDER BY display_order'
    ).all(field.field_id)).toEqual([
      { option_value: '1', display_label: 'Strongly Disagree' },
      { option_value: '2', display_label: 'Disagree' },
      { option_value: '3', display_label: 'Some What Disagree' },
      { option_value: '4', display_label: 'Neutral' },
      { option_value: '5', display_label: 'Some What Agree' },
      { option_value: '6', display_label: 'Agree' },
      { option_value: '7', display_label: 'Strongly Agree' },
    ]);
  });

  test('DELETE template removes template and related submissions/reports', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
    ).run('Delete Template', 'template to delete').lastInsertRowid);

    // insert a survey submission linked to template via responses.templateId
    const responseObj = JSON.stringify({ templateId: formId, templateTitle: 'Delete Template', q1: 'yes' });
    const surveyId = Number(state.db.prepare(
      'INSERT INTO surveys (name, email, responses, submitted_at) VALUES (?, ?, ?, ?)' 
    ).run('User X', 'x@example.com', responseObj, '2026-03-24T00:00:00.000Z').lastInsertRowid);

    state.db.prepare('INSERT INTO reports (survey_id, report_data, created_at) VALUES (?, ?, ?)').run(surveyId, JSON.stringify({ summary: 'x' }), '2026-03-24T00:00:00.000Z');

    const res = await DELETE(new Request(`http://localhost:3000/api/surveys/templates?templateId=${formId}`, { method: 'DELETE' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form WHERE form_id = ?').get(formId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM surveys WHERE id = ?').get(surveyId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM reports WHERE survey_id = ?').get(surveyId).c).toBe(0);
  });

  test('DELETE template removes its own fields and options but keeps core and initiative fields', async () => {
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (1, ?, ?, 1)'
    ).run('Field Cleanup', 'x').lastInsertRowid);
    const addField = (key, core, initiative) => Number(state.db.prepare(`
      INSERT INTO field (field_key, field_label, field_type, scope, initiative_id, is_core_question, is_initiative_specific)
      VALUES (?, ?, 'select', ?, ?, ?, ?)
    `).run(key, key, initiative ? 'initiative_specific' : 'common', initiative ? 1 : null, core, initiative).lastInsertRowid);
    const ownId = addField('cleanup_own', 0, 0);
    const coreId = addField('cleanup_core', 1, 0);
    const initiativeId = addField('cleanup_initiative', 0, 1);
    for (const fieldId of [ownId, coreId, initiativeId]) {
      state.db.prepare('INSERT INTO form_questions (form_id, field_id, root_field_id) VALUES (?, ?, ?)').run(formId, fieldId, fieldId);
      state.db.prepare("INSERT INTO field_options (field_id, option_value, display_label) VALUES (?, 'a', 'A')").run(fieldId);
    }

    const res = await DELETE(new Request(`http://localhost:3000/api/surveys/templates?templateId=${formId}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);

    const fieldCount = (id) => state.db.prepare('SELECT COUNT(*) AS c FROM field WHERE field_id = ?').get(id).c;
    const optionCount = (id) => state.db.prepare('SELECT COUNT(*) AS c FROM field_options WHERE field_id = ?').get(id).c;
    expect(fieldCount(ownId)).toBe(0);
    expect(optionCount(ownId)).toBe(0);
    expect(fieldCount(coreId)).toBe(1);
    expect(optionCount(coreId)).toBe(1);
    expect(fieldCount(initiativeId)).toBe(1);
    expect(optionCount(initiativeId)).toBe(1);
  });
});
