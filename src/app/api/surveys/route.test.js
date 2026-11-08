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

// One published survey with a text question and a number question.
function seedSurvey(db, { title = 'Survey A', initiativeName = 'Initiative A' } = {}) {
  const initiativeId = Number(db.prepare(
    "INSERT INTO initiative (initiative_name, attributes, questions, settings) VALUES (?, '[]', '[]', '{}')"
  ).run(initiativeName).lastInsertRowid);
  const formId = Number(db.prepare(
    'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
  ).run(initiativeId, title).lastInsertRowid);
  const versionId = Number(db.prepare(
    "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
  ).run(formId).lastInsertRowid);
  const textId = Number(db.prepare(
    "INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, 'Favorite color', 'text', 'common')"
  ).run(`color_${formId}`).lastInsertRowid);
  const numberId = Number(db.prepare(
    "INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, 'Score', 'number', 'common')"
  ).run(`score_${formId}`).lastInsertRowid);
  db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 0, 0)').run(formId, versionId, textId);
  db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 1, 0)').run(formId, versionId, numberId);
  return { initiativeId, formId, versionId, textId, numberId };
}

function postResponse(survey, answers) {
  return POST(new Request('http://localhost:3000/api/surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: survey.formId, responses: { templateId: survey.formId, templateAnswers: answers } }),
  }));
}

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

  test('POST rejects a payload without responses, without a survey, or for an unknown survey', async () => {
    const post = (body) => POST(new Request('http://localhost:3000/api/surveys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect((await post({ name: 'Alex' })).status).toBe(400);
    expect((await post({ responses: { q1: 'yes' } })).status).toBe(400);
    expect((await post({ templateId: 9999, responses: { templateId: 9999, templateAnswers: {} } })).status).toBe(404);
  });

  test('POST stores the response only in submission / submission_value', async () => {
    const survey = seedSurvey(state.db, { title: 'Stored Survey' });
    // Older clients still send a name and email; they are ignored.
    const res = await POST(new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Anonymous', email: 'anonymous+1@asrs.local', templateId: survey.formId,
        responses: { templateId: survey.formId, templateAnswers: { [survey.textId]: 'Blue', [survey.numberId]: 4 } },
      }),
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).not.toHaveProperty('report');
    expect(payload.survey).toEqual({ id: payload.surveyId, templateId: survey.formId, templateTitle: 'Stored Survey', submittedAt: expect.anything() });

    const submission = state.db.prepare('SELECT * FROM submission WHERE submission_id = ?').get(payload.surveyId);
    expect(submission).toMatchObject({ form_id: survey.formId, initiative_id: survey.initiativeId, form_version_id: survey.versionId });
    const values = state.db.prepare('SELECT value_text, value_number FROM submission_value WHERE submission_id = ? ORDER BY submission_value_id').all(payload.surveyId);
    expect(values).toEqual([{ value_text: 'Blue', value_number: null }, { value_text: null, value_number: 4 }]);
    // The old duplicate JSON table is gone.
    expect(state.db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'surveys'").get().c).toBe(0);
  });

  test('POST stores dropdown and multiple-choice labels as text', async () => {
    const initiativeId = Number(state.db.prepare(
      "INSERT INTO initiative (initiative_name, attributes, questions, settings) VALUES (?, '[]', '[]', '{}')"
    ).run('Typed Answers').lastInsertRowid);
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
    ).run(initiativeId, 'Typed Survey').lastInsertRowid);
    const versionId = Number(state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid);
    const selectId = Number(state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, 'text', 'common', ?)"
    ).run('school', 'School', JSON.stringify({ ui_type: 'select' })).lastInsertRowid);
    const radioId = Number(state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, 'text', 'common', ?)"
    ).run('recommend', 'Recommend?', JSON.stringify({ ui_type: 'radio' })).lastInsertRowid);
    state.db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, ?, 1)').run(formId, versionId, selectId, 0);
    state.db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, ?, 1)').run(formId, versionId, radioId, 1);
    state.db.prepare('INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)').run(selectId, 'Rutgers', 'Rutgers', 0);
    state.db.prepare('INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)').run(radioId, 'Yes', 'Yes', 0);
    const yesNoId = Number(state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, 'yesno', 'common')"
    ).run('attended', 'Attended?').lastInsertRowid);
    state.db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, ?, 1)').run(formId, versionId, yesNoId, 2);
    ['Yes', 'No', 'N/A'].forEach((option, index) => {
      state.db.prepare('INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)').run(yesNoId, option, option, index);
    });

    const res = await POST(new Request('http://localhost:3000/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taylor',
        email: 'taylor@example.com',
        templateId: formId,
        responses: { templateId: formId, templateAnswers: { [selectId]: 'Rutgers', [radioId]: 'Yes', [yesNoId]: 'N/A' } },
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
      { field_id: yesNoId, value_text: 'N/A', value_number: null, value_bool: null, value_json: null },
    ]);
  });

  test('DELETE removes the response and its answers', async () => {
    const survey = seedSurvey(state.db);
    const { surveyId } = await (await postResponse(survey, { [survey.textId]: 'Red' })).json();

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    const res = await DELETE(new Request(`http://localhost:3000/api/surveys?surveyId=${surveyId}`, {
      method: 'DELETE',
      headers: createAuthedRequestHeaders(tokens),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, surveyId });
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM submission WHERE submission_id = ?').get(surveyId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM submission_value WHERE submission_id = ?').get(surveyId).c).toBe(0);
  });

  test('DELETE returns 404 for a response that does not exist', async () => {
    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    const res = await DELETE(new Request('http://localhost:3000/api/surveys?surveyId=999', {
      method: 'DELETE',
      headers: createAuthedRequestHeaders(tokens),
    }));
    expect(res.status).toBe(404);
  });

  test('GET requires auth outside test env', async () => {
    process.env.NODE_ENV = 'development';

    const res = await GET(new Request('http://localhost:3000/api/surveys'));
    expect(res.status).toBe(401);
  });

  test('GET returns a page of responses with answers keyed by question root id', async () => {
    process.env.NODE_ENV = 'development';
    const survey = seedSurvey(state.db, { title: 'Paged Survey' });
    for (const [color, score] of [['Red', 1], ['Green', 2], ['Blue', 3]]) {
      await postResponse(survey, { [survey.textId]: color, [survey.numberId]: score });
    }
    // Distinct, increasing timestamps so "newest first" is deterministic.
    state.db.prepare("UPDATE submission SET submitted_at = '2026-01-0' || submission_id || ' 10:00:00'").run();

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    const get = async (query) => {
      const res = await GET(new Request(`http://localhost:3000/api/surveys${query}`, { headers: createAuthedRequestHeaders(tokens) }));
      return { status: res.status, body: await res.json() };
    };

    const first = await get(`?templateId=${survey.formId}&limit=2`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(first.body.surveys.map((s) => s.answers[survey.textId])).toEqual(['Blue', 'Green']);
    expect(first.body.surveys[0]).toMatchObject({
      templateId: survey.formId, templateTitle: 'Paged Survey', initiativeId: survey.initiativeId, respondent: null,
      answers: { [survey.textId]: 'Blue', [survey.numberId]: 3 },
    });

    const second = await get(`?templateId=${survey.formId}&limit=2&offset=2`);
    expect(second.body.surveys.map((s) => s.answers[survey.textId])).toEqual(['Red']);
  });

  test('GET filters by survey and by initiative', async () => {
    process.env.NODE_ENV = 'development';
    const a = seedSurvey(state.db, { title: 'A', initiativeName: 'Init A' });
    const b = seedSurvey(state.db, { title: 'B', initiativeName: 'Init B' });
    await postResponse(a, { [a.textId]: 'a1' });
    await postResponse(a, { [a.textId]: 'a2' });
    await postResponse(b, { [b.textId]: 'b1' });

    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    const total = async (query) => (await (await GET(new Request(`http://localhost:3000/api/surveys${query}`, {
      headers: createAuthedRequestHeaders(tokens),
    }))).json()).total;

    expect(await total('')).toBe(3);
    expect(await total(`?templateId=${a.formId}`)).toBe(2);
    expect(await total(`?initiativeId=${b.initiativeId}`)).toBe(1);
  });

  test('GET rejects invalid paging and filter parameters', async () => {
    process.env.NODE_ENV = 'development';
    const tokens = createSessionForRank(state.db, { rank: 100, verified: 1 });
    for (const query of ['?limit=0', '?offset=-1', '?templateId=abc', '?initiativeId=1.5']) {
      const res = await GET(new Request(`http://localhost:3000/api/surveys${query}`, { headers: createAuthedRequestHeaders(tokens) }));
      expect(res.status).toBe(400);
    }
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

});
