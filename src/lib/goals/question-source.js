import { querySelectedQuestionData } from '@/lib/query-helpers';
import { computeTrendData } from '@/lib/report-engine';
import { getGoalSourceMethodLabel, methodNeedsAnswer } from '@/lib/analysis-methods';
import { performGoalUpdate } from '@/lib/goals/perform-goal-update';
import { answerMatcher, computeAnswerValue } from '@/lib/answer-analysis';

function toNumber(value) {
  const numericValue = Number(value);
  return value !== null && value !== '' && Number.isFinite(numericValue) ? numericValue : null;
}

/**
 * Current answer options of a question (from its latest wording), as
 * { value, label } pairs. Empty for free-text questions.
 */
export function loadQuestionOptions(db, initiativeId, rootFieldId) {
  const latest = db.prepare(`
    SELECT fq.field_id
    FROM form_version_questions fvq
    JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
    JOIN form fm ON fm.form_id = fq.form_id
    WHERE fq.root_field_id = ? AND fm.initiative_id = ?
    ORDER BY fvq.form_version_id DESC, fvq.form_question_id DESC
    LIMIT 1
  `).get(rootFieldId, initiativeId);
  if (!latest) return [];
  return db.prepare(
    'SELECT option_value, display_label FROM field_options WHERE field_id = ? ORDER BY display_order'
  ).all(latest.field_id).map((option) => ({ value: String(option.option_value), label: option.display_label }));
}

/**
 * Compute a goal's current value from a survey question's responses, using the
 * same analysis as report generation (or, for the answer_* methods, counting a
 * target answer). rootFieldId is the question's root_field_id, so answers from
 * every revision of the question are included.
 *
 * Returns { value, questionLabel, methodLabel, description, questionActive,
 * answerAvailable }; value is null when there is not enough data to produce one.
 */
export function computeQuestionSourceValue(db, initiativeId, rootFieldId, method, answer = null) {
  const methodLabel = getGoalSourceMethodLabel(method);
  const { tableData, questions } = querySelectedQuestionData(db, initiativeId, [rootFieldId]);
  if (questions.length === 0) {
    return { value: null, questionLabel: null, methodLabel, description: 'The attached question is no longer part of this initiative.', questionActive: false, answerAvailable: true };
  }

  const question = questions[0];
  const questionActive = Number(question.is_active) === 1;
  let value = null;
  let description;
  let answerAvailable = true;

  if (methodNeedsAnswer(method)) {
    const options = loadQuestionOptions(db, initiativeId, rootFieldId);
    if (!answer) {
      return { value: null, questionLabel: question.field_label, methodLabel, description: 'No target answer is set.', questionActive, answerAvailable: false };
    }
    answerAvailable = options.length === 0 || !!answerMatcher(answer, options).option;
    ({ value, description } = computeAnswerValue(tableData, question.column, method, answer, options));
    if (!answerAvailable) description = `${description} "${answer}" is no longer an answer option on this question.`;
  } else {
    const [analysis] = computeTrendData(tableData, {
      variables: [question.column],
      method,
      enabledCalc: true,
      enabledDisplay: true,
      thresholdPct: 2,
    });
    description = analysis?.description || 'No responses yet.';
    if (method === 'average') {
      value = toNumber(analysis?.result);
    } else if (method === 'most_popular' || method === 'least_common') {
      value = toNumber(analysis?.result);
      if (value === null && analysis?.result != null) {
        description = `${description} This answer is not a number, so it cannot be compared with the target. Use an answer-based method instead.`;
      }
    } else {
      // delta_halves / linear_slope: signed percentage change across responses.
      value = toNumber(analysis?.signedChangePct);
    }
  }
  if (!questionActive) description = `${description} This question was removed from its survey, so no new responses are coming in.`;

  return {
    value: value === null ? null : Math.round(value * 100) / 100,
    questionLabel: question.field_label,
    methodLabel,
    description,
    questionActive,
    answerAvailable,
  };
}

/**
 * Refresh current_value for every question-sourced goal of an initiative and
 * save changes, so stored scores (dashboard, overall score) stay current.
 * Goals without enough data are stored as 0, but that 0 is not recorded in
 * progress history (it is "no data", not a measured 0). Returns a Map of goal_id to the
 * computed source details for display.
 */
export function syncQuestionSourcedGoals(db, initiativeId, { userEmail = 'system' } = {}) {
  const goals = db.prepare(`
    SELECT * FROM initiative_goal
    WHERE initiative_id = ? AND source_root_field_id IS NOT NULL AND source_method IS NOT NULL
  `).all(initiativeId);

  const sources = new Map();
  for (const goal of goals) {
    if (goal.source_root_field_id == null || !goal.source_method) continue;
    const source = computeQuestionSourceValue(db, initiativeId, goal.source_root_field_id, goal.source_method, goal.source_answer);
    sources.set(goal.goal_id, source);
    const nextValue = source.value ?? 0;
    if (Number(goal.current_value) !== nextValue) {
      performGoalUpdate(db, goal, { current_value: nextValue }, { userEmail, recordHistory: source.value !== null });
    }
  }
  return sources;
}
