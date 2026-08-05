import { logAudit } from '@/lib/audit';

const ALLOWED_FIELDS = [
  'goal_name',
  'description',
  'target_metric',
  'target_value',
  'current_value',
  'weight',
  'scoring_method',
  'deadline',
];

function isValidWeight(weight) {
  const numericWeight = Number(weight);
  return Number.isFinite(numericWeight) && numericWeight >= 1 && numericWeight <= 100;
}

function computeGoalScore(goal) {
  const { current_value, target_value, scoring_method } = goal;
  switch (scoring_method) {
    case 'linear':
      if (target_value === 0) return 0;
      return Math.min((current_value / target_value) * 100, 100);
    case 'threshold':
      return current_value >= target_value ? 100 : 0;
    case 'binary':
      return current_value > 0 ? 100 : 0;
    default:
      return 0;
  }
}

/**
 * Apply a partial patch to an initiative_goal row. Records progress history when current_value changes.
 * @param {{ prepare(sql: string): { get(...values: unknown[]): unknown, run(...values: unknown[]): unknown } }} db
 * @param {Record<string, unknown>} existing - full row from initiative_goal
 * @param {Record<string, unknown>} updates - subset of allowed fields
 * @param {{ userEmail: string }} ctx
 */
export function performGoalUpdate(db, existing, updates, { userEmail }) {
  const goal_id = existing.goal_id;

  if (updates.scoring_method && !['linear', 'threshold', 'binary'].includes(updates.scoring_method)) {
    return { error: 'Invalid scoring_method. Must be: linear, threshold, or binary' };
  }
  if (updates.weight !== undefined && !isValidWeight(updates.weight)) {
    return { error: 'Weight must be greater than 1 and less than 100' };
  }

  const setClauses = [];
  const values = [];

  for (const field of ALLOWED_FIELDS) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    return { error: 'No valid fields to update' };
  }

  setClauses.push("updated_at = datetime('now')");
  values.push(goal_id);

  db.prepare(`
    UPDATE initiative_goal
    SET ${setClauses.join(', ')}
    WHERE goal_id = ?
  `).run(...values);

  const updatedGoal = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(goal_id);

  if (updates.current_value !== undefined) {
    db.prepare(`
      INSERT INTO goal_progress_history (goal_id, initiative_id, recorded_value, target_value, score)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      goal_id,
      updatedGoal.initiative_id,
      updatedGoal.current_value,
      updatedGoal.target_value,
      computeGoalScore(updatedGoal)
    );
  }

  const changes = {};
  for (const field of ALLOWED_FIELDS) {
    if (updates[field] !== undefined && updates[field] !== existing[field]) {
      changes[field] = { from: existing[field], to: updates[field] };
    }
  }

  logAudit(db, {
    event: 'goal.updated',
    userEmail,
    targetType: 'goal',
    targetId: String(goal_id),
    payload: {
      goal_name: updatedGoal.goal_name,
      initiative_id: updatedGoal.initiative_id,
      changes,
    },
  });

  return { goal: updatedGoal };
}

export { ALLOWED_FIELDS, computeGoalScore };
