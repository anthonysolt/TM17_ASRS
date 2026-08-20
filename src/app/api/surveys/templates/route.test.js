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

    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)' 
    ).run('pulse_1', 'How are you?', 'choice', 'common').lastInsertRowid);

    state.db.prepare(
      'INSERT INTO form_field (form_id, field_id, display_order, required, help_text) VALUES (?, ?, 0, 1, ?)'
    ).run(formId, fieldId, 'Select one');

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

    const initiativeId = Number(state.db.prepare(`
      INSERT INTO initiative (initiative_name, attributes, questions, settings)
      VALUES (?, '[]', '[]', '{}')
    `).run('Readiness Initiative').lastInsertRowid);
    const attributeId = Number(state.db.prepare(`
      INSERT INTO initiative_attribute (name, data_type, initiative_id) VALUES (?, ?, ?)
    `).run('Readiness Comment', 'text', initiativeId).lastInsertRowid);

    const validReq = new Request('http://localhost:3000/api/surveys/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({
        title: 'Readiness Survey',
        description: 'A readiness template',
        initiative_id: initiativeId,
        questions: [
          { text: { question: 'Q1', type: 'choice', required: true, options: ['yes', 'no'], save_for_reuse: true } },
          { text: { question: 'Q2', type: 'text', required: false, attribute_id: attributeId, save_for_reuse: false } },
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
    const linkedField = state.db.prepare('SELECT attribute_id FROM field WHERE field_label = ?').get('Q2');
    const multipleChoiceField = state.db.prepare(
      'SELECT field_type, validation_rules FROM field WHERE field_label = ?'
    ).get('Q1');
    const reuseSettings = state.db.prepare(
      'SELECT field_label, is_reusable FROM field ORDER BY field_label'
    ).all();

    expect(formCount).toBe(1);
    expect(fieldCount).toBe(2);
    expect(optionCount).toBe(2);
    expect(linkedField.attribute_id).toBe(attributeId);
    expect(multipleChoiceField.field_type).toBe('text');
    expect(JSON.parse(multipleChoiceField.validation_rules).ui_type).toBe('choice');
    expect(reuseSettings).toEqual([
      { field_label: 'Q1', is_reusable: 1 },
      { field_label: 'Q2', is_reusable: 0 },
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

    const reportId = Number(state.db.prepare('INSERT INTO reports (survey_id, report_data, created_at) VALUES (?, ?, ?)')
      .run(surveyId, JSON.stringify({ summary: 'x' }), '2026-03-24T00:00:00.000Z').lastInsertRowid);
    state.db.prepare('INSERT INTO report_generation_log (report_id) VALUES (?)').run(reportId);

    const res = await DELETE(new Request(`http://localhost:3000/api/surveys/templates?templateId=${formId}`, { method: 'DELETE' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form WHERE form_id = ?').get(formId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM surveys WHERE id = ?').get(surveyId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM reports WHERE survey_id = ?').get(surveyId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM report_generation_log WHERE report_id = ?').get(reportId).c).toBe(0);
  });
});
