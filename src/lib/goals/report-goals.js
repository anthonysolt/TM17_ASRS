import { computeGoalScore } from '@/lib/goals/perform-goal-update';
import { computeQuestionSourceValue } from '@/lib/goals/question-source';

/**
 * Goals of an initiative as they appear on a report, scored the same way as
 * the Goals page. Question-sourced goals use their freshly computed value
 * (0 when there is not enough data, as syncQuestionSourcedGoals stores it),
 * but nothing is written back, so building a report never edits a goal.
 *
 * goalIds limits the result to those goals; goals of other initiatives are
 * never returned, so callers can compare lengths to detect invalid ids.
 */
export function queryReportGoals(db, initiativeId, goalIds = null) {
  if (Array.isArray(goalIds) && goalIds.length === 0) return [];
  const idFilter = Array.isArray(goalIds)
    ? `AND goal_id IN (${goalIds.map(() => '?').join(', ')})`
    : '';

  const rows = db.prepare(`
    SELECT goal_id, goal_name, description, target_value, current_value, weight,
           scoring_method, deadline, source_root_field_id, source_method
    FROM initiative_goal
    WHERE initiative_id = ? ${idFilter}
    ORDER BY created_at ASC, goal_id ASC
  `).all(initiativeId, ...(goalIds || []));

  return rows.map((row) => {
    const source = row.source_root_field_id != null && row.source_method
      ? computeQuestionSourceValue(db, initiativeId, row.source_root_field_id, row.source_method)
      : null;
    const goal = {
      ...row,
      goal_id: Number(row.goal_id),
      target_value: Number(row.target_value),
      current_value: source ? (source.value ?? 0) : Number(row.current_value),
      weight: Number(row.weight),
      source,
    };
    return { ...goal, score: parseFloat(computeGoalScore(goal).toFixed(2)) };
  });
}
