import { queryReportGoals } from '@/lib/goals/report-goals';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

let db;

function insertGoal(initiativeId, overrides = {}) {
  const goal = {
    goal_name: 'Goal', target_value: 100, current_value: 0, weight: 50, scoring_method: 'linear',
    source_root_field_id: null, source_method: null, ...overrides,
  };
  return Number(db.prepare(`
    INSERT INTO initiative_goal (initiative_id, goal_name, target_metric, target_value, current_value, weight, scoring_method, source_root_field_id, source_method)
    VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
  `).run(
    initiativeId, goal.goal_name, goal.target_value, goal.current_value, goal.weight,
    goal.scoring_method, goal.source_root_field_id, goal.source_method
  ).lastInsertRowid);
}

/** One rating question with the given answers; returns its root field id. */
function seedRatingQuestion(initiativeId, answers) {
  const formId = Number(db.prepare(
    'INSERT INTO form (initiative_id, form_name, is_published) VALUES (?, ?, 1)'
  ).run(initiativeId, 'Survey').lastInsertRowid);
  const versionId = Number(db.prepare(
    "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
  ).run(formId).lastInsertRowid);
  const fieldId = Number(db.prepare(
    'INSERT INTO field (field_key, field_label, field_type, scope) VALUES (?, ?, ?, ?)'
  ).run('experience', 'Rate your experience', 'rating', 'common').lastInsertRowid);
  const placementId = Number(db.prepare(
    'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, 0)'
  ).run(formId, versionId, fieldId).lastInsertRowid);
  for (const value of answers) {
    const submissionId = Number(db.prepare(
      'INSERT INTO submission (initiative_id, form_id, form_version_id) VALUES (?, ?, ?)'
    ).run(initiativeId, formId, versionId).lastInsertRowid);
    db.prepare(
      'INSERT INTO submission_value (submission_id, form_question_id, value_number) VALUES (?, ?, ?)'
    ).run(submissionId, placementId, value);
  }
  return fieldId;
}

describe('queryReportGoals', () => {
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { closeTestDb(db); db = null; });

  test('returns only the initiative\'s goals, scored', () => {
    const initiativeId = insertInitiative(db, { initiative_name: 'A' });
    const otherId = insertInitiative(db, { initiative_name: 'B' });
    const goalId = insertGoal(initiativeId, { goal_name: 'Participation', current_value: 25 });
    insertGoal(otherId, { goal_name: 'Other initiative' });

    const goals = queryReportGoals(db, initiativeId);

    expect(goals).toEqual([expect.objectContaining({
      goal_id: goalId, goal_name: 'Participation', current_value: 25, target_value: 100, score: 25, source: null,
    })]);
  });

  test('limits to the selected ids and never returns another initiative\'s goal', () => {
    const initiativeId = insertInitiative(db, { initiative_name: 'A' });
    const otherId = insertInitiative(db, { initiative_name: 'B' });
    insertGoal(initiativeId, { goal_name: 'Not selected' });
    const selectedId = insertGoal(initiativeId, { goal_name: 'Selected' });
    const foreignId = insertGoal(otherId, { goal_name: 'Foreign' });

    const goals = queryReportGoals(db, initiativeId, [selectedId, foreignId]);

    expect(goals.map((goal) => goal.goal_name)).toEqual(['Selected']);
    expect(queryReportGoals(db, initiativeId, [])).toEqual([]);
  });

  test('uses the computed value of a question-sourced goal without saving it', () => {
    const initiativeId = insertInitiative(db, { initiative_name: 'A' });
    const fieldId = seedRatingQuestion(initiativeId, [3, 4, 5]);
    const goalId = insertGoal(initiativeId, {
      target_value: 4, current_value: 0, scoring_method: 'threshold', source_root_field_id: fieldId, source_method: 'average',
    });

    const [goal] = queryReportGoals(db, initiativeId);

    expect(goal.current_value).toBe(4);
    expect(goal.score).toBe(100);
    expect(goal.source.questionLabel).toBe('Rate your experience');
    const stored = db.prepare('SELECT current_value FROM initiative_goal WHERE goal_id = ?').get(goalId);
    expect(stored.current_value).toBe(0);
  });
});
