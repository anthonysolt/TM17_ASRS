const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));
vi.mock('@/lib/db', () => ({ default: dbProxy, db: dbProxy, initializeDatabase: vi.fn() }));
vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: () => ({ user: { email: 'staff@test.com', permissions: ['goals.manage'] } }),
  requireAuth: () => ({ user: { email: 'staff@test.com', permissions: ['goals.manage'] } }),
}));
vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({ eventBus: { publish: vi.fn() } }),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { POST, PUT } from '@/app/api/goals/route';
import { syncQuestionSourcedGoals } from '@/lib/goals/question-source';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

describe('/api/goals answer-based question sources', () => {
  let initiativeId;
  let rootId;

  beforeEach(() => {
    state.db = createTestDb();
    const db = state.db;
    // Not part of the shared harness schema; mirrors database/schema.sql.
    db.exec(`CREATE TABLE IF NOT EXISTS goal_progress_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL, initiative_id INTEGER NOT NULL,
      recorded_value REAL NOT NULL, target_value REAL NOT NULL, score REAL NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    initiativeId = insertInitiative(db, { initiative_name: 'Goal Answers' });
    const formId = Number(db.prepare('INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)').run(initiativeId, 'Survey').lastInsertRowid);
    const versionId = Number(db.prepare("INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')").run(formId).lastInsertRowid);
    rootId = Number(db.prepare('INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)').run('attend', 'Will you attend?', 'yesno', 'common').lastInsertRowid);
    ['Yes', 'No'].forEach((option, index) => db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)'
    ).run(rootId, option, option, index));
    const placementId = Number(db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 0, 1)'
    ).run(formId, versionId, rootId).lastInsertRowid);
    ['Yes', 'Yes', 'No'].forEach((answer) => {
      const submissionId = Number(db.prepare('INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)').run(initiativeId, formId, versionId).lastInsertRowid);
      db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (?, ?, ?)').run(submissionId, placementId, answer);
    });
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  const request = (method, body) => new Request('http://localhost:3000/api/goals', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const baseGoal = () => ({
    initiative_id: initiativeId,
    goal_name: '50 yes responses',
    target_value: 50,
    weight: 100,
    scoring_method: 'linear',
    source_root_field_id: rootId,
  });

  test('requires a target answer for answer-based methods', async () => {
    const response = await POST(request('POST', { ...baseGoal(), source_method: 'answer_count' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/target answer/);
  });

  test('stores the target answer and computes the count', async () => {
    const response = await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.goal).toMatchObject({ source_method: 'answer_count', source_answer: 'Yes', current_value: 2 });
  });

  test('rejects a method that does not fit the question type', async () => {
    const response = await POST(request('POST', { ...baseGoal(), source_method: 'average' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/cannot be used for the question/);
  });

  test('lets an existing goal keep a method saved before methods were limited', async () => {
    const created = await (await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }))).json();
    state.db.prepare("UPDATE initiative_goal SET source_method = 'average', source_answer = NULL WHERE goal_id = ?").run(created.goal.goal_id);

    const renamed = await PUT(request('PUT', {
      goal_id: created.goal.goal_id, goal_name: 'Renamed', source_root_field_id: rootId, source_method: 'average', source_answer: null,
    }));
    expect(renamed.status).toBe(200);

    const switched = await PUT(request('PUT', { goal_id: created.goal.goal_id, source_method: 'linear_slope' }));
    expect(switched.status).toBe(400);
  });

  test('clears the target answer when switching to a non-answer method', async () => {
    const created = await (await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }))).json();
    const response = await PUT(request('PUT', { goal_id: created.goal.goal_id, source_method: 'most_popular' }));

    expect(response.status).toBe(200);
    expect(state.db.prepare('SELECT source_answer FROM initiative_goal WHERE goal_id = ?').get(created.goal.goal_id).source_answer).toBeNull();
  });

  test('rejects a target of 0 or below for linear and binary goals', async () => {
    const zero = await POST(request('POST', { ...baseGoal(), target_value: 0, source_method: 'answer_count', source_answer: 'Yes' }));
    expect(zero.status).toBe(400);
    expect((await zero.json()).error).toMatch(/greater than 0/);

    const created = await (await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }))).json();
    const negative = await PUT(request('PUT', { goal_id: created.goal.goal_id, target_value: -5 }));
    expect(negative.status).toBe(400);
    const toBinary = await PUT(request('PUT', { goal_id: created.goal.goal_id, scoring_method: 'binary', target_value: 1 }));
    expect(toBinary.status).toBe(200);
  });

  test('a goal with no responses yet starts at 0 without a history entry', async () => {
    const db = state.db;
    const formId = db.prepare('SELECT form_id FROM form WHERE initiative_id = ?').get(initiativeId).form_id;
    const versionId = db.prepare('SELECT form_version_id FROM form_version WHERE form_id = ?').get(formId).form_version_id;
    const emptyId = Number(db.prepare('INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)').run('unanswered', 'Unanswered?', 'yesno', 'common').lastInsertRowid);
    db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 1, 0)').run(formId, versionId, emptyId);

    const response = await POST(request('POST', {
      ...baseGoal(), source_root_field_id: emptyId, source_method: 'answer_count', source_answer: 'Yes',
    }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.goal.current_value).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM goal_progress_history WHERE goal_id = ?').get(body.goal.goal_id).n).toBe(0);

    // A goal with responses still records its starting value.
    const answered = await (await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }))).json();
    expect(db.prepare('SELECT COUNT(*) AS n FROM goal_progress_history WHERE goal_id = ?').get(answered.goal.goal_id).n).toBe(1);
  });

  test('sync stores 0 when every response is gone, without recording it as progress', async () => {
    const db = state.db;
    const created = await (await POST(request('POST', { ...baseGoal(), source_method: 'answer_count', source_answer: 'Yes' }))).json();
    const historyCount = () => db.prepare('SELECT COUNT(*) AS n FROM goal_progress_history WHERE goal_id = ?').get(created.goal.goal_id).n;
    expect(created.goal.current_value).toBe(2);
    expect(historyCount()).toBe(1);

    db.prepare('DELETE FROM submission_value').run();
    db.prepare('DELETE FROM submission').run();
    syncQuestionSourcedGoals(db, initiativeId);

    expect(db.prepare('SELECT current_value FROM initiative_goal WHERE goal_id = ?').get(created.goal.goal_id).current_value).toBe(0);
    expect(historyCount()).toBe(1);
  });
});
