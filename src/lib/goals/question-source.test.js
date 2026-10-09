import { computeQuestionSourceValue, syncQuestionSourcedGoals } from '@/lib/goals/question-source';
import { computeGoalScore } from '@/lib/goals/perform-goal-update';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

let db;

function seedRatingQuestion(answers) {
  const initiativeId = insertInitiative(db, { initiative_name: 'Rated Initiative' });
  const formId = Number(db.prepare(
    'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
  ).run(initiativeId, 'Experience Survey').lastInsertRowid);
  const versionId = Number(db.prepare(
    "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
  ).run(formId).lastInsertRowid);
  const fieldId = Number(db.prepare(
    'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
  ).run('experience', 'How would you rate your experience with this initiative?', 'rating', 'common').lastInsertRowid);
  const placementId = Number(db.prepare(
    'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, 0)'
  ).run(formId, versionId, fieldId).lastInsertRowid);

  const answer = (placement, value) => {
    const submissionId = Number(db.prepare(
      'INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)'
    ).run(initiativeId, formId, versionId).lastInsertRowid);
    db.prepare(
      'INSERT INTO submission_value (submission_id, form_question_id, value_number) VALUES (?, ?, ?)'
    ).run(submissionId, placement, value);
  };
  answers.forEach((value) => answer(placementId, value));
  return { initiativeId, formId, fieldId, answer };
}

function insertSourcedGoal(initiativeId, fieldId, method) {
  return Number(db.prepare(`
    INSERT INTO initiative_goal (initiative_id, goal_name, target_metric, target_value, current_value, weight, scoring_method, source_root_field_id, source_method)
    VALUES (?, 'Average Rating', '', 4, 0, 100, 'threshold', ?, ?)
  `).run(initiativeId, fieldId, method).lastInsertRowid);
}

describe('question-sourced goals', () => {
  beforeEach(() => {
    db = createTestDb();
    db.exec(`CREATE TABLE IF NOT EXISTS goal_progress_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER, initiative_id INTEGER, recorded_value REAL, target_value REAL, score REAL,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`);
  });
  afterEach(() => { closeTestDb(db); db = null; });

  test('average answer sources the current value and meets a 4 out of 5 target', () => {
    const { initiativeId, fieldId } = seedRatingQuestion([3, 4, 5]);
    const goalId = insertSourcedGoal(initiativeId, fieldId, 'average');

    const sources = syncQuestionSourcedGoals(db, initiativeId);
    const goal = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(goalId);

    expect(sources.get(goalId).value).toBe(4);
    expect(sources.get(goalId).questionLabel).toBe('How would you rate your experience with this initiative?');
    expect(goal.current_value).toBe(4);
    expect(computeGoalScore(goal)).toBe(100);
  });

  test('includes answers from every revision of the question', () => {
    const { initiativeId, formId, fieldId } = seedRatingQuestion([2, 2]);
    // Version 2 rewords the question; it keeps the same root_field_id.
    const v2 = Number(db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 2, 'published')"
    ).run(formId).lastInsertRowid);
    const editedFieldId = Number(db.prepare(
      'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
    ).run('experience_v2', 'Rate your experience', 'rating', 'common').lastInsertRowid);
    const v2Placement = Number(db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, root_field_id, display_order) VALUES (?, ?, ?, ?, 0)'
    ).run(formId, v2, editedFieldId, fieldId).lastInsertRowid);
    const submissionId = Number(db.prepare(
      'INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)'
    ).run(initiativeId, formId, v2).lastInsertRowid);
    db.prepare(
      'INSERT INTO submission_value (submission_id, form_question_id, value_number) VALUES (?, ?, ?)'
    ).run(submissionId, v2Placement, 5);

    const result = computeQuestionSourceValue(db, initiativeId, fieldId, 'average');

    expect(result.value).toBe(3);
    expect(result.questionLabel).toBe('Rate your experience');
  });

  test('returns no value when there are no responses yet', () => {
    const { initiativeId, fieldId } = seedRatingQuestion([]);

    expect(computeQuestionSourceValue(db, initiativeId, fieldId, 'average').value).toBeNull();
  });
});
