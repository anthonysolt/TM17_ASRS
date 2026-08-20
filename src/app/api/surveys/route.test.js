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

  test('POST stores browser number-input strings in value_number', async () => {
    const initiativeId = Number(state.db.prepare(`
      INSERT INTO initiative (initiative_name, attributes, questions, settings)
      VALUES (?, '[]', '[]', '{}')
    `).run('Numeric Answers').lastInsertRowid);
    const formId = Number(state.db.prepare(`
      INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)
    `).run(initiativeId, 'Numeric Survey').lastInsertRowid);
    const fieldId = Number(state.db.prepare(`
      INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, 'number', 'common')
    `).run('participant_count', 'How many participants?').lastInsertRowid);
    state.db.prepare(`
      INSERT INTO form_field (form_id, field_id, display_order, required) VALUES (?, ?, 0, 1)
    `).run(formId, fieldId);

    const res = await POST(new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taylor',
        email: 'taylor@example.com',
        templateId: formId,
        responses: { templateId: formId, templateAnswers: { [fieldId]: '42.5' } },
      }),
    }));

    expect(res.status).toBe(200);
    const stored = state.db.prepare(`
      SELECT value_text, value_number FROM submission_value WHERE field_id = ?
    `).get(fieldId);
    expect(stored).toEqual({ value_text: null, value_number: 42.5 });
  });

  test('DELETE removes the complete survey submission footprint', async () => {
    const initiativeId = Number(state.db.prepare(`
      INSERT INTO initiative (initiative_name, attributes, questions, settings)
      VALUES (?, '[]', '[]', '{}')
    `).run('Delete Survey Initiative').lastInsertRowid);
    const formId = Number(state.db.prepare('INSERT INTO form (initiative_id, form_name) VALUES (?, ?)')
      .run(initiativeId, 'Delete Survey Form').lastInsertRowid);
    const fieldId = Number(state.db.prepare(`
      INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, 'number', 'common')
    `).run('delete_count', 'Count').lastInsertRowid);
    state.db.prepare('INSERT INTO form_field (form_id, field_id, display_order) VALUES (?, ?, 0)').run(formId, fieldId);
    const surveyId = Number(state.db.prepare(
      'INSERT INTO surveys (name, email, responses, submitted_at) VALUES (?, ?, ?, ?)' 
    ).run('DeleteMe', 'del@example.com', JSON.stringify({ templateId: formId, q: 'x' }), '2026-03-24T00:00:00.000Z').lastInsertRowid);

    const reportId = Number(state.db.prepare('INSERT INTO reports (survey_id, report_data, created_at) VALUES (?, ?, ?)')
      .run(surveyId, JSON.stringify({ summary: 'd' }), '2026-03-24T00:00:00.000Z').lastInsertRowid);
    state.db.prepare('INSERT INTO report_generation_log (report_id) VALUES (?)').run(reportId);
    const submissionId = Number(state.db.prepare(`
      INSERT INTO submission (initiative_id, form_id) VALUES (?, ?)
    `).run(initiativeId, formId).lastInsertRowid);
    state.db.prepare('INSERT INTO submission_value (submission_id, field_id, value_number) VALUES (?, ?, ?)')
      .run(submissionId, fieldId, 7);
    const secondSubmissionId = Number(state.db.prepare(`
      INSERT INTO submission (initiative_id, form_id) VALUES (?, ?)
    `).run(initiativeId, formId).lastInsertRowid);
    state.db.prepare('INSERT INTO submission_value (submission_id, field_id, value_number) VALUES (?, ?, ?)')
      .run(secondSubmissionId, fieldId, 9);
    const qrCodeId = Number(state.db.prepare(`
      INSERT INTO qr_codes (qr_code_key, qr_type, target_id, target_url) VALUES (?, 'survey', ?, ?)
    `).run('delete-survey-qr', surveyId, '/survey').lastInsertRowid);
    state.db.prepare('INSERT INTO qr_scans (qr_code_id) VALUES (?)').run(qrCodeId);
    state.db.prepare(`
      INSERT INTO survey_distribution (survey_template_id, start_date, end_date, response_count)
      VALUES (?, '2026-03-01', '2026-03-31', 1)
    `).run(String(formId));

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
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM submission WHERE form_id = ?').get(formId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM submission_value WHERE submission_id = ?').get(submissionId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM submission_value WHERE submission_id = ?').get(secondSubmissionId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM report_generation_log WHERE report_id = ?').get(reportId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM qr_codes WHERE qr_code_id = ?').get(qrCodeId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM qr_scans WHERE qr_code_id = ?').get(qrCodeId).c).toBe(0);
    expect(state.db.prepare('SELECT response_count FROM survey_distribution').get().response_count).toBe(0);
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
