const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
  exec: (...args) => state.db.exec(...args),
}));
vi.mock('@/lib/db', () => ({
  default: dbProxy,
  db: dbProxy,
  initializeDatabase: vi.fn(),
}));

import { GET, POST, DELETE } from '@/app/api/surveys/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
} from '@/test/integration/api-test-harness';

describe('/api/surveys integration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    state.db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('POST validates required fields', async () => {
    const req = new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('POST persists a survey without generating a report', async () => {
    const req = new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alex',
        email: 'a@example.com',
        responses: { q1: 'yes', q2: 4 },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload).not.toHaveProperty('report');

    const surveyCount = state.db.prepare('SELECT COUNT(*) AS c FROM surveys').get().c;
    const reportCount = state.db.prepare('SELECT COUNT(*) AS c FROM reports WHERE survey_id IS NOT NULL').get().c;
    expect(surveyCount).toBe(1);
    expect(reportCount).toBe(0);
    expect(payload.submittedAt).toBeTruthy();
    expect(payload.survey).toMatchObject({ name: 'Alex', email: 'a@example.com' });
  });

  test('POST stores dropdown and multiple-choice labels as text', async () => {
    state.db.exec(`
      CREATE TABLE survey_distribution (
        distribution_id INTEGER PRIMARY KEY AUTOINCREMENT,
        survey_template_id TEXT,
        start_date TEXT,
        end_date TEXT,
        response_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const initiativeId = Number(state.db.prepare(
      "INSERT INTO initiative (initiative_name, attributes, questions, settings) VALUES (?, '[]', '[]', '{}')"
    ).run('Typed Answers').lastInsertRowid);
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
    ).run(initiativeId, 'Typed Survey').lastInsertRowid);
    const selectId = Number(state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, 'text', 'common', ?)"
    ).run('school', 'School', JSON.stringify({ ui_type: 'select' })).lastInsertRowid);
    const radioId = Number(state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, 'text', 'common', ?)"
    ).run('recommend', 'Recommend?', JSON.stringify({ ui_type: 'radio' })).lastInsertRowid);
    state.db.prepare('INSERT INTO form_questions (form_id, field_id, display_order, required) VALUES (?, ?, ?, 1)').run(formId, selectId, 0);
    state.db.prepare('INSERT INTO form_questions (form_id, field_id, display_order, required) VALUES (?, ?, ?, 1)').run(formId, radioId, 1);
    state.db.prepare('INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)').run(selectId, 'Rutgers', 'Rutgers', 0);
    state.db.prepare('INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)').run(radioId, 'Yes', 'Yes', 0);

    const res = await POST(new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taylor',
        email: 'taylor@example.com',
        templateId: formId,
        responses: { templateId: formId, templateAnswers: { [selectId]: 'Rutgers', [radioId]: 'Yes' } },
      }),
    }));

    expect(res.status).toBe(200);
    expect(state.db.prepare(
      `SELECT fq.field_id, sv.value_text, sv.value_number, sv.value_bool, sv.value_json
       FROM submission_value sv
       JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
       ORDER BY fq.field_id`
    ).all()).toEqual([
      { field_id: selectId, value_text: 'Rutgers', value_number: null, value_bool: null, value_json: null },
      { field_id: radioId, value_text: 'Yes', value_number: null, value_bool: null, value_json: null },
    ]);
  });

  test('DELETE removes survey and related reports', async () => {
    const surveyId = Number(state.db.prepare(
      'INSERT INTO surveys (name, email, responses, submitted_at) VALUES (?, ?, ?, ?)' 
    ).run('DeleteMe', 'del@example.com', JSON.stringify({ q: 'x' }), '2026-03-24T00:00:00.000Z').lastInsertRowid);

    state.db.prepare('INSERT INTO reports (survey_id, report_data, created_at) VALUES (?, ?, ?)').run(surveyId, JSON.stringify({ summary: 'd' }), '2026-03-24T00:00:00.000Z');

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    const res = await DELETE(new Request(`http://localhost:3000/api/surveys?surveyId=${surveyId}`, {
      method: 'DELETE',
      headers: createAuthedRequestHeaders(tokens),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.surveyId).toBe(surveyId);

    const remainingSurveyCount = state.db.prepare('SELECT COUNT(*) AS c FROM surveys WHERE id = ?').get(surveyId).c;
    const remainingReportCount = state.db.prepare('SELECT COUNT(*) AS c FROM reports WHERE survey_id = ?').get(surveyId).c;

    expect(remainingSurveyCount).toBe(0);
    expect(remainingReportCount).toBe(0);
  });

  test('GET requires auth outside test env', async () => {
    process.env.NODE_ENV = 'development';

    const res = await GET(new Request('http://localhost:3000/api/surveys'));
    expect(res.status).toBe(401);
  });

  test('GET returns parsed surveys when authorized', async () => {
    process.env.NODE_ENV = 'development';

    const surveyId = Number(state.db.prepare(
      'INSERT INTO surveys (name, email, responses, submitted_at) VALUES (?, ?, ?, ?)'
    ).run('Jordan', 'j@example.com', JSON.stringify({ q1: 'yes' }), '2026-03-05T00:00:00.000Z').lastInsertRowid);

    state.db.prepare(
      'INSERT INTO reports (survey_id, report_data, created_at) VALUES (?, ?, ?)'
    ).run(surveyId, JSON.stringify({ summary: 'great' }), '2026-03-05T00:00:00.000Z');

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });

    const res = await GET(new Request('http://localhost:3000/api/surveys', {
      headers: createAuthedRequestHeaders(tokens),
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.surveys).toHaveLength(1);
    expect(payload.surveys[0].responses.q1).toBe('yes');
    expect(payload.surveys[0].report.summary).toBe('great');
  });

  test('GET denies public user access to PII endpoint', async () => {
    process.env.NODE_ENV = 'development';

    const tokens = createSessionForRank(state.db, { rank: 10, verified: 1 });
    const res = await GET(new Request('http://localhost:3000/api/surveys', {
      headers: createAuthedRequestHeaders(tokens),
    }));
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.error).toContain('insufficient permissions');
  });

  test('GET returns 500 when stored survey JSON is malformed', async () => {
    process.env.NODE_ENV = 'development';

    state.db.prepare(
      'INSERT INTO surveys (name, email, responses) VALUES (?, ?, ?)'
    ).run('Broken', 'b@example.com', 'not-json');

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });

    const res = await GET(new Request('http://localhost:3000/api/surveys', {
      headers: createAuthedRequestHeaders(tokens),
    }));

    expect(res.status).toBe(500);
  });
});
