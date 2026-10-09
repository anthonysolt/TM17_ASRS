import { querySelectedQuestionData } from '@/lib/query-helpers';
import { computeTrendData } from '@/lib/report-engine';
import { getAnalysisMethodLabel } from '@/lib/analysis-methods';
import { performGoalUpdate } from '@/lib/goals/perform-goal-update';

function toNumber(value) {
  const numericValue = Number(value);
  return value !== null && value !== '' && Number.isFinite(numericValue) ? numericValue : null;
}

/**
 * Compute a goal's current value from a survey question's responses, using the
 * same analysis as report generation. rootFieldId is the question's
 * root_field_id, so answers from every revision of the question are included.
 *
 * Returns { value, questionLabel, methodLabel, description }; value is null
 * when there is not enough numeric data to produce one.
 */
export function computeQuestionSourceValue(db, initiativeId, rootFieldId, method) {
  const methodLabel = getAnalysisMethodLabel(method);
  const { tableData, questions } = querySelectedQuestionData(db, initiativeId, [rootFieldId]);
  if (questions.length === 0) {
    return { value: null, questionLabel: null, methodLabel, description: 'The attached question is no longer part of this initiative.' };
  }

  const question = questions[0];
  const [analysis] = computeTrendData(tableData, {
    variables: [question.column],
    method,
    enabledCalc: true,
    enabledDisplay: true,
    thresholdPct: 2,
  });

  let value = null;
  let description = analysis?.description || 'No responses yet.';
  if (method === 'average') {
    value = toNumber(analysis?.result);
  } else if (method === 'most_popular' || method === 'least_common') {
    value = toNumber(analysis?.result);
    if (value === null && analysis?.result != null) {
      description = `${description} This answer is not a number, so it cannot be compared with the target.`;
    }
  } else {
    // delta_halves / linear_slope: signed percentage change across responses.
    value = toNumber(analysis?.signedChangePct);
  }

  return {
    value: value === null ? null : Math.round(value * 100) / 100,
    questionLabel: question.field_label,
    methodLabel,
    description,
  };
}

/**
 * Refresh current_value for every question-sourced goal of an initiative and
 * save changes, so stored scores (dashboard, overall score) stay current.
 * Goals without enough data are stored as 0. Returns a Map of goal_id to the
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
    const source = computeQuestionSourceValue(db, initiativeId, goal.source_root_field_id, goal.source_method);
    sources.set(goal.goal_id, source);
    const nextValue = source.value ?? 0;
    if (Number(goal.current_value) !== nextValue) {
      performGoalUpdate(db, goal, { current_value: nextValue }, { userEmail });
    }
  }
  return sources;
}
