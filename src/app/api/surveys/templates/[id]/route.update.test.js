const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  transaction: (...args) => state.db.transaction(...args),
}));

vi.mock('@/lib/db.js', () => ({ default: dbProxy }));

import { PUT } from '@/app/api/surveys/templates/[id]/route';
import { queryInitiativeQuestions } from '@/lib/query-helpers';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
  insertInitiative,
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
    const versionId = Number(state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid);
    const fieldId = Number(state.db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope, validation_rules) VALUES (?, ?, ?, ?, ?)'
    ).run('editable_choice', 'Old question?', 'text', 'common', JSON.stringify({ ui_type: 'radio' })).lastInsertRowid);
    state.db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 0, 1)'
    ).run(formId, versionId, fieldId);
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
    const oldField = state.db.prepare(
      'SELECT field_label, field_type, validation_rules FROM field WHERE field_id = ?'
    ).get(fieldId);
    const currentVersion = state.db.prepare(
      "SELECT form_version_id, version_number FROM form_version WHERE form_id = ? AND status = 'published'"
    ).get(formId);
    const placement = state.db.prepare(
      `SELECT fq.required, fq.field_id, fq.root_field_id FROM form_questions fq
       JOIN form_version_questions fvq ON fvq.form_question_id = fq.form_question_id
       WHERE fq.form_id = ? AND fvq.form_version_id = ?`
    ).get(formId, currentVersion.form_version_id);
    const field = state.db.prepare(
      'SELECT field_label, field_type, validation_rules FROM field WHERE field_id = ?'
    ).get(placement.field_id);
    const options = state.db.prepare(
      'SELECT option_value FROM field_options WHERE field_id = ? ORDER BY display_order'
    ).all(placement.field_id).map(option => option.option_value);

    expect(response.status).toBe(200);
    expect(currentVersion.version_number).toBe(2);
    expect(placement.field_id).not.toBe(fieldId);
    expect(placement.root_field_id).toBe(fieldId);
    expect(field.field_label).toBe('Updated question?');
    expect(field.field_type).toBe('text');
    expect(JSON.parse(field.validation_rules).ui_type).toBe('radio');
    expect(placement.required).toBe(0);
    expect(options).toEqual(['Yes', 'No']);
    expect(oldField.field_label).toBe('Old question?');
    expect(state.db.prepare('SELECT option_value FROM field_options WHERE field_id = ?').get(fieldId).option_value).toBe('Old');
  });

  function seedForm(questions) {
    const initiativeId = insertInitiative(state.db, { initiative_name: 'Versioned Initiative' });
    const formId = Number(state.db.prepare(
      'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
    ).run(initiativeId, 'Versioned Survey').lastInsertRowid);
    const versionId = Number(state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid);
    const submissionId = Number(state.db.prepare(
      'INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)'
    ).run(initiativeId, formId, versionId).lastInsertRowid);
    const fieldIds = questions.map(([key, label], index) => {
      const fieldId = Number(state.db.prepare(
        'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
      ).run(key, label, 'text', 'common').lastInsertRowid);
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

  function putQuestions(formId, questions, extraBody = {}) {
    const tokens = createSessionForRank(state.db, { rank: 50 });
    return PUT(new Request(`http://localhost:3000/api/surveys/templates/${formId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({ questions, ...extraBody }),
    }), { params: Promise.resolve({ id: String(formId) }) });
  }

  const countAnswers = (fieldId) => state.db.prepare(`
    SELECT COUNT(*) AS c FROM submission_value sv
    JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE fq.root_field_id = ?
  `).get(fieldId).c;

  const countVersions = (formId) => state.db.prepare(
    'SELECT COUNT(*) AS c FROM form_version WHERE form_id = ?'
  ).get(formId).c;

  test('removing a question retires it and keeps its answers for reports', async () => {
    const { formId, initiativeId, fieldIds: [retainedFieldId, removedFieldId] } = seedForm([
      ['retained', 'Keep me'],
      ['removed', 'Remove me'],
    ]);

    const response = await putQuestions(formId, [
      { id: retainedFieldId, question: 'Keep me', type: 'text', required: true },
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.revision).toMatchObject({
      versionCreated: true,
      editMode: 'versioned',
      retiredQuestionCount: 1,
      retainedAnswerCount: 1,
    });
    expect(countAnswers(removedFieldId)).toBe(1);
    expect(countAnswers(retainedFieldId)).toBe(1);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM field WHERE field_id = ?').get(removedFieldId).c).toBe(1);

    const published = state.db.prepare(`
      SELECT fq.root_field_id FROM form_version_questions fvq
      JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
      JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
      WHERE fv.form_id = ? AND fv.status = 'published'
    `).all(formId).map(row => row.root_field_id);
    expect(published).toEqual([retainedFieldId]);

    const reportQuestions = queryInitiativeQuestions(state.db, initiativeId);
    expect(reportQuestions.map(q => [q.field_id, q.is_active])).toEqual([
      [retainedFieldId, 1],
      [removedFieldId, 0],
    ]);
  });

  test('re-adding a retired question reconnects its earlier answers', async () => {
    const { formId, initiativeId, fieldIds: [keptId, removedId] } = seedForm([
      ['kept', 'Kept'],
      ['comes_back', 'Comes back'],
    ]);
    await putQuestions(formId, [{ id: keptId, question: 'Kept', type: 'text', required: true }]);

    const response = await putQuestions(formId, [
      { id: keptId, question: 'Kept', type: 'text', required: true },
      { id: removedId, question: 'Comes back', type: 'text', required: true },
    ]);

    expect(response.status).toBe(200);
    const active = queryInitiativeQuestions(state.db, initiativeId).find(q => q.field_id === removedId);
    expect(active.is_active).toBe(1);
    expect(countAnswers(removedId)).toBe(1);
  });

  test('saving with no question changes creates no version and only updates details', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['same', 'Same question']]);

    const response = await putQuestions(formId, [
      { id: fieldId, question: 'Same question', type: 'text', required: true },
    ], { title: 'Renamed survey' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.revision).toMatchObject({ versionCreated: false, editMode: 'none', versionNumber: 1 });
    expect(countVersions(formId)).toBe(1);
    expect(state.db.prepare('SELECT form_name FROM form WHERE form_id = ?').get(formId).form_name).toBe('Renamed survey');
  });

  test('builder round-trip rules (merged field rules with ui_type) are not treated as a change', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['ruled', 'Ruled question']]);
    state.db.prepare('UPDATE field SET validation_rules = ? WHERE field_id = ?')
      .run(JSON.stringify({ ui_type: 'text', maxLength: 50 }), fieldId);

    const response = await putQuestions(formId, [{
      id: fieldId, question: 'Ruled question', type: 'text', required: true,
      form_validation_rules: { ui_type: 'text', maxLength: 50 },
    }]);

    expect(response.status).toBe(200);
    expect((await response.json()).revision.versionCreated).toBe(false);
    expect(countVersions(formId)).toBe(1);
  });

  test('required, help text, and order changes are saved in place without a new version', async () => {
    const { formId, fieldIds: [firstId, secondId] } = seedForm([
      ['first', 'First'],
      ['second', 'Second'],
    ]);
    const rowsBefore = state.db.prepare('SELECT COUNT(*) AS c FROM form_questions WHERE form_id = ?').get(formId).c;

    const response = await putQuestions(formId, [
      { id: secondId, question: 'Second', type: 'text', required: true, help_text: 'New help' },
      { id: firstId, question: 'First', type: 'text', required: false },
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.revision).toMatchObject({ versionCreated: false, editMode: 'in_place', versionNumber: 1 });
    expect(countVersions(formId)).toBe(1);
    expect(state.db.prepare('SELECT COUNT(*) AS c FROM form_questions WHERE form_id = ?').get(formId).c).toBe(rowsBefore);
    const placements = state.db.prepare(`
      SELECT fq.field_id, fq.required, fq.help_text, fvq.display_order
      FROM form_version_questions fvq
      JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
      WHERE fq.form_id = ?
      ORDER BY fvq.display_order
    `).all(formId);
    expect(placements).toEqual([
      { field_id: secondId, required: 1, help_text: 'New help', display_order: 0 },
      { field_id: firstId, required: 0, help_text: null, display_order: 1 },
    ]);
    expect(countAnswers(firstId)).toBe(1);
  });

  test('changing answer options always creates a new version', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['choice', 'Pick one']]);
    state.db.prepare('UPDATE field SET validation_rules = ? WHERE field_id = ?')
      .run(JSON.stringify({ ui_type: 'radio' }), fieldId);
    state.db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, 0)'
    ).run(fieldId, 'A', 'A');

    const response = await putQuestions(formId, [
      { id: fieldId, question: 'Pick one', type: 'radio', required: true, options: ['A', 'B'] },
    ]);

    expect(response.status).toBe(200);
    expect((await response.json()).revision).toMatchObject({ versionCreated: true, versionNumber: 2 });
    expect(countVersions(formId)).toBe(2);
  });

  test('reports goals that use a reworded question', async () => {
    const { formId, initiativeId, fieldIds: [fieldId] } = seedForm([['goal_q', 'Original wording']]);
    state.db.prepare(`
      INSERT INTO initiative_goal (initiative_id, goal_name, target_metric, target_value, source_root_field_id, source_method)
      VALUES (?, 'Goal', 'metric', 10, ?, 'average')
    `).run(initiativeId, fieldId);

    const response = await putQuestions(formId, [{ id: fieldId, question: 'New wording', type: 'text', required: true }]);

    expect((await response.json()).revision.affectedGoalCount).toBe(1);
  });

  test('rejects a save based on an out-of-date copy of the survey', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['stale', 'Stale question']]);
    state.db.prepare("UPDATE form SET updated_at = '2026-11-06T10:00:00.000Z' WHERE form_id = ?").run(formId);

    const stale = await putQuestions(formId, [
      { id: fieldId, question: 'Changed by second editor', type: 'text', required: true },
    ], { expected_updated_at: '2026-11-06T09:00:00.000Z' });

    expect(stale.status).toBe(409);
    expect((await stale.json()).conflict).toBe(true);
    expect(countVersions(formId)).toBe(1);

    const fresh = await putQuestions(formId, [
      { id: fieldId, question: 'Changed by first editor', type: 'text', required: true },
    ], { expected_updated_at: '2026-11-06T10:00:00.000Z' });
    expect(fresh.status).toBe(200);
    expect(countVersions(formId)).toBe(2);
  });

  test('editing a question keeps earlier answers linked to it', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['renamed', 'Old label']]);

    const response = await putQuestions(formId, [
      { id: fieldId, question: 'New label', type: 'text', required: true },
    ]);

    expect(response.status).toBe(200);
    const roots = state.db.prepare(
      'SELECT DISTINCT root_field_id FROM form_questions WHERE form_id = ?'
    ).all(formId);
    expect(roots).toEqual([{ root_field_id: fieldId }]);
    expect(countAnswers(fieldId)).toBe(1);
  });

  test('publishing unchanged questions reuses their rows instead of copying them', async () => {
    const { formId, fieldIds: [keptFieldId, editedFieldId] } = seedForm([
      ['kept', 'Unchanged'],
      ['edited', 'Before edit'],
    ]);
    const countRows = () => state.db.prepare(
      'SELECT COUNT(*) AS c FROM form_questions WHERE form_id = ?'
    ).get(formId).c;

    const response = await putQuestions(formId, [
      { id: editedFieldId, question: 'After edit', type: 'text', required: true },
      { id: keptFieldId, question: 'Unchanged', type: 'text', required: true },
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.revision.reusedQuestionCount).toBe(1);
    expect(countRows()).toBe(3);
    const published = state.db.prepare(`
      SELECT fq.form_question_id, fq.root_field_id, fvq.display_order
      FROM form_version_questions fvq
      JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
      JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
      WHERE fv.form_id = ? AND fv.status = 'published'
      ORDER BY fvq.display_order
    `).all(formId);
    expect(published.map(row => row.root_field_id)).toEqual([editedFieldId, keptFieldId]);
    const originalKeptRow = state.db.prepare(
      'SELECT MIN(form_question_id) AS id FROM form_questions WHERE root_field_id = ?'
    ).get(keptFieldId).id;
    expect(published[1].form_question_id).toBe(originalKeptRow);

    // Publishing again with nothing changed adds no question rows at all.
    const editedSnapshotId = state.db.prepare(
      'SELECT field_id FROM form_questions WHERE form_question_id = ?'
    ).get(published[0].form_question_id).field_id;
    expect((await putQuestions(formId, [
      { id: editedSnapshotId, question: 'After edit', type: 'text', required: true },
      { id: keptFieldId, question: 'Unchanged', type: 'text', required: true },
    ])).status).toBe(200);
    expect(countRows()).toBe(3);
  });

  test('rejects changing the type of an existing question', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['typed', 'Typed question']]);

    const response = await putQuestions(formId, [
      { id: fieldId, question: 'Typed question', type: 'number', required: true },
    ]);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/cannot be changed/);
    expect(state.db.prepare(
      'SELECT COUNT(*) AS c FROM form_version WHERE form_id = ?'
    ).get(formId).c).toBe(1);
  });

  test('adding a question starts a new root without touching existing answers', async () => {
    const { formId, fieldIds: [fieldId] } = seedForm([['existing', 'Existing']]);

    const response = await putQuestions(formId, [
      { id: fieldId, question: 'Existing', type: 'text', required: true },
      { question: 'Brand new', type: 'text', required: false },
    ]);

    expect(response.status).toBe(200);
    const added = state.db.prepare(`
      SELECT fq.field_id, fq.root_field_id FROM form_questions fq
      JOIN field f ON f.field_id = fq.field_id
      WHERE fq.form_id = ? AND f.field_label = 'Brand new'
    `).get(formId);
    expect(added.root_field_id).toBe(added.field_id);
    expect(countAnswers(fieldId)).toBe(1);
  });

  test('saved questions can be marked as core or initiative questions while editing', async () => {
    const { formId, fieldIds: [coreId, initiativeId] } = seedForm([['to_core', 'Core me'], ['to_init', 'Initiative me']]);

    const response = await putQuestions(formId, [
      { id: coreId, question: 'Core me', type: 'text', required: true, is_core_question: true },
      { id: initiativeId, question: 'Initiative me', type: 'text', required: true, is_initiative_specific: true },
    ]);

    expect(response.status).toBe(200);
    const readField = (id) => state.db.prepare(
      'SELECT is_core_question, is_initiative_specific, scope, initiative_id FROM field WHERE field_id = ?'
    ).get(id);
    expect(readField(coreId)).toMatchObject({ is_core_question: 1, is_initiative_specific: 0, scope: 'common', initiative_id: null });
    expect(readField(initiativeId)).toMatchObject({ is_core_question: 0, is_initiative_specific: 1, scope: 'initiative_specific', initiative_id: 1 });
  });

  test.each([
    [false, 0],
    [true, 1],
  ])('editing a saved core question leaves it unchanged; the copy is core only when re-ticked (%s)', async (retick, expectedCore) => {
    const { formId, fieldIds: [coreId] } = seedForm([['saved_core', 'Saved wording']]);
    state.db.prepare('UPDATE field SET is_core_question = 1 WHERE field_id = ?').run(coreId);

    const response = await putQuestions(formId, [
      { id: coreId, question: 'Edited wording', type: 'text', required: true, is_core_question: retick },
    ]);

    expect(response.status).toBe(200);
    const original = state.db.prepare('SELECT field_label, is_core_question FROM field WHERE field_id = ?').get(coreId);
    expect(original).toEqual({ field_label: 'Saved wording', is_core_question: 1 });
    const copy = state.db.prepare(
      "SELECT field_id, is_core_question FROM field WHERE field_label = 'Edited wording'"
    ).get();
    expect(copy.field_id).not.toBe(coreId);
    expect(copy.is_core_question).toBe(expectedCore);
  });
});
