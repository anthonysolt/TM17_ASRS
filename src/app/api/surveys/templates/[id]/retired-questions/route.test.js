const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('@/lib/db.js', () => ({ default: dbProxy }));

import { PUT } from '@/app/api/surveys/templates/[id]/route';
import { DELETE, GET } from '@/app/api/surveys/templates/[id]/retired-questions/route';
import { queryInitiativeQuestions } from '@/lib/query-helpers';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
  insertInitiative,
} from '@/test/integration/api-test-harness';

describe('/api/surveys/templates/:id/retired-questions', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    state.db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  function seedForm(labels) {
    const initiativeId = insertInitiative(state.db, { initiative_name: 'Retired Initiative' });
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
    ).run(initiativeId, 'Retired Survey').lastInsertRowid);
    const versionId = Number(state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid);
    const submissionId = Number(state.db.prepare(
      'INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)'
    ).run(initiativeId, formId, versionId).lastInsertRowid);
    const fieldIds = labels.map((label, index) => {
      const fieldId = Number(state.db.prepare(
        'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
      ).run(`key_${index}`, label, 'text', 'common').lastInsertRowid);
      const placementId = Number(state.db.prepare(
        'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, ?, 1)'
      ).run(formId, versionId, fieldId, index).lastInsertRowid);
      state.db.prepare(
        'INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (?, ?, ?)'
      ).run(submissionId, placementId, `answer to ${label}`);
      return fieldId;
    });
    return { formId, initiativeId, fieldIds };
  }

  const headers = () => ({
    'Content-Type': 'application/json',
    ...createAuthedRequestHeaders(createSessionForRank(state.db, { rank: 50 }), { csrf: true }),
  });
  const params = (formId) => ({ params: Promise.resolve({ id: String(formId) }) });
  const url = (formId, query = '') => `http://localhost:3000/api/surveys/templates/${formId}/retired-questions${query}`;

  const retire = (formId, keptId, keptLabel) => PUT(new Request(`http://localhost:3000/api/surveys/templates/${formId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ questions: [{ id: keptId, question: keptLabel, type: 'text', required: true }] }),
  }), params(formId));

  const countAnswers = (rootId) => state.db.prepare(`
    SELECT COUNT(*) AS c FROM submission_value sv
    JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE fq.root_field_id = ?
  `).get(rootId).c;

  test('lists retired questions with the answers they keep', async () => {
    const { formId, fieldIds: [keptId, retiredId] } = seedForm(['Kept', 'Retired']);
    await retire(formId, keptId, 'Kept');

    const response = await GET(new Request(url(formId), { headers: headers() }), params(formId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toMatchObject({
      rootFieldId: retiredId,
      fieldId: retiredId,
      label: 'Retired',
      type: 'text',
      answerCount: 1,
      linkedGoalCount: 0,
      sharedWithOtherForms: false,
    });
  });

  test('deleting a retired question removes its answers, placements, field, and goal links', async () => {
    const { formId, initiativeId, fieldIds: [keptId, retiredId] } = seedForm(['Kept', 'Retired']);
    const goalId = Number(state.db.prepare(`
      INSERT INTO initiative_goal (initiative_id, goal_name, target_metric, target_value, source_root_field_id, source_method)
      VALUES (?, 'Goal', 'metric', 10, ?, 'average')
    `).run(initiativeId, retiredId).lastInsertRowid);
    await retire(formId, keptId, 'Kept');

    const response = await DELETE(new Request(url(formId, `?rootFieldId=${retiredId}`), {
      method: 'DELETE', headers: headers(),
    }), params(formId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ deletedAnswerCount: 1, unlinkedGoalCount: 1 });
    expect(countAnswers(retiredId)).toBe(0);
    expect(countAnswers(keptId)).toBe(1);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form_questions WHERE root_field_id = ?').get(retiredId).c).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM field WHERE field_id = ?').get(retiredId).c).toBe(0);
    expect(state.db.prepare('SELECT source_root_field_id FROM initiative_goal WHERE goal_id = ?').get(goalId).source_root_field_id).toBeNull();
    expect(queryInitiativeQuestions(state.db, initiativeId).map(q => q.field_id)).toEqual([keptId]);
  });

  test('refuses to delete a question that is still on the survey', async () => {
    const { formId, fieldIds: [activeId] } = seedForm(['Active']);

    const response = await DELETE(new Request(url(formId, `?rootFieldId=${activeId}`), {
      method: 'DELETE', headers: headers(),
    }), params(formId));

    expect(response.status).toBe(409);
    expect(countAnswers(activeId)).toBe(1);
  });

  test('keeps a core question field when deleting it from a survey', async () => {
    const { formId, fieldIds: [keptId, coreId] } = seedForm(['Kept', 'Core']);
    state.db.prepare('UPDATE field SET is_core_question = 1 WHERE field_id = ?').run(coreId);
    await retire(formId, keptId, 'Kept');

    const response = await DELETE(new Request(url(formId, `?rootFieldId=${coreId}`), {
      method: 'DELETE', headers: headers(),
    }), params(formId));

    expect(response.status).toBe(200);
    expect(countAnswers(coreId)).toBe(0);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM field WHERE field_id = ?').get(coreId).c).toBe(1);
  });

  test('unretiring a reworded question by its latest field keeps its original history', async () => {
    const { formId, initiativeId, fieldIds: [keptId, rootId] } = seedForm(['Kept', 'Old wording']);
    const put = (questions) => PUT(new Request(`http://localhost:3000/api/surveys/templates/${formId}`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ questions }),
    }), params(formId));
    const kept = { id: keptId, question: 'Kept', type: 'text', required: true };

    await put([kept, { id: rootId, question: 'New wording', type: 'text', required: true }]);
    await put([kept]);
    const [retired] = (await (await GET(new Request(url(formId), { headers: headers() }), params(formId))).json()).questions;
    expect(retired).toMatchObject({ rootFieldId: rootId, label: 'New wording' });
    expect(retired.fieldId).not.toBe(rootId);

    const response = await put([kept, { id: retired.fieldId, question: retired.label, type: 'text', required: true }]);

    expect(response.status).toBe(200);
    const restored = queryInitiativeQuestions(state.db, initiativeId).find(q => q.field_id === rootId);
    expect(restored).toMatchObject({ field_label: 'New wording', is_active: 1 });
    expect(countAnswers(rootId)).toBe(1);
  });

  test('returns 404 for a question not on the survey', async () => {
    const { formId } = seedForm(['Only']);
    const response = await DELETE(new Request(url(formId, '?rootFieldId=99999'), {
      method: 'DELETE', headers: headers(),
    }), params(formId));
    expect(response.status).toBe(404);
  });
});
