import { computeQuestionSourceValue } from '@/lib/goals/question-source';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

describe('computeQuestionSourceValue answer-based methods', () => {
  let db;
  let initiativeId;
  let formId;
  let versionId;

  beforeEach(() => {
    db = createTestDb();
    initiativeId = insertInitiative(db, { initiative_name: 'Answer Goals' });
    formId = Number(db.prepare('INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)').run(initiativeId, 'Survey').lastInsertRowid);
    versionId = Number(db.prepare("INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')").run(formId).lastInsertRowid);
  });

  afterEach(() => closeTestDb(db));

  // Adds a question with options and one submission per answer.
  function seedQuestion({ type = 'yesno', options, answers }) {
    const fieldId = Number(db.prepare('INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)')
      .run(`q_${Math.random()}`, 'Question', type, 'common').lastInsertRowid);
    options.forEach(([value, label], index) => db.prepare(
      'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?, ?, ?, ?)'
    ).run(fieldId, value, label, index));
    const placementId = Number(db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order, required) VALUES (?, ?, ?, 0, 1)'
    ).run(formId, versionId, fieldId).lastInsertRowid);
    answers.forEach((answer) => {
      const submissionId = Number(db.prepare('INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)')
        .run(initiativeId, formId, versionId).lastInsertRowid);
      if (answer === null) return;
      const column = type === 'multiselect' ? 'value_json' : 'value_text';
      db.prepare(`INSERT INTO submission_value (submission_id, form_question_id, ${column}) VALUES (?, ?, ?)`)
        .run(submissionId, placementId, type === 'multiselect' ? JSON.stringify(answer) : answer);
    });
    return fieldId;
  }

  const yesNo = [['Yes', 'Yes'], ['No', 'No']];

  test('answer_count counts matching responses, by value or label and ignoring case', () => {
    const rootId = seedQuestion({ options: yesNo, answers: ['Yes', 'yes', 'No', 'Yes'] });
    expect(computeQuestionSourceValue(db, initiativeId, rootId, 'answer_count', 'Yes')).toMatchObject({ value: 3, answerAvailable: true });
  });

  test('answer_count matches an option label when answers store the option value', () => {
    const rootId = seedQuestion({ type: 'text', options: [['swim', 'Swimming'], ['run', 'Running']], answers: ['swim', 'run', 'swim'] });
    expect(computeQuestionSourceValue(db, initiativeId, rootId, 'answer_count', 'Swimming').value).toBe(2);
  });

  test('checkbox answers match when the ticked list includes the answer', () => {
    const rootId = seedQuestion({
      type: 'multiselect',
      options: [['Swimming', 'Swimming'], ['Running', 'Running']],
      answers: [['Swimming', 'Running'], ['Running'], ['Swimming']],
    });
    expect(computeQuestionSourceValue(db, initiativeId, rootId, 'answer_count', 'Swimming').value).toBe(2);
  });

  test('answer_share leaves unanswered responses out of the total', () => {
    const rootId = seedQuestion({ options: yesNo, answers: ['Yes', 'No', 'No', 'No', null] });
    expect(computeQuestionSourceValue(db, initiativeId, rootId, 'answer_share', 'Yes').value).toBe(25);
  });

  test('answer_is_most_common is 1 when the answer wins or ties, 0 otherwise', () => {
    const activities = [['Swimming', 'Swimming'], ['Running', 'Running'], ['Biking', 'Biking']];
    const winning = seedQuestion({ type: 'text', options: activities, answers: ['Swimming', 'Swimming', 'Running'] });
    const tied = seedQuestion({ type: 'text', options: activities, answers: ['Swimming', 'Running'] });
    const losing = seedQuestion({ type: 'text', options: activities, answers: ['Running', 'Running', 'Swimming'] });

    expect(computeQuestionSourceValue(db, initiativeId, winning, 'answer_is_most_common', 'Swimming').value).toBe(1);
    expect(computeQuestionSourceValue(db, initiativeId, tied, 'answer_is_most_common', 'Swimming').value).toBe(1);
    expect(computeQuestionSourceValue(db, initiativeId, losing, 'answer_is_most_common', 'Swimming').value).toBe(0);
  });

  test('flags a target answer that is no longer an option', () => {
    const rootId = seedQuestion({ type: 'text', options: [['Swim', 'Swim'], ['Run', 'Run']], answers: ['Swimming', 'Run'] });
    const result = computeQuestionSourceValue(db, initiativeId, rootId, 'answer_count', 'Swimming');
    expect(result).toMatchObject({ value: 1, answerAvailable: false });
    expect(result.description).toMatch(/no longer an answer option/);
  });
});
