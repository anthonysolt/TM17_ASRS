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
  'source_root_field_id',
  'source_method',
];

function isValidWeight(weight) {
  const numericWeight = Number(weight);
  const hundredths = numericWeight * 100;
  return Number.isFinite(numericWeight)
    && numericWeight >= 0
    && numericWeight <= 100
    && Math.abs(hundredths - Math.round(hundredths)) < 1e-8;
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

function rebalanceGoalWeights(db, existing, requestedWeight) {
  const peers = db.prepare(`
    SELECT goal_id, weight
    FROM initiative_goal
    WHERE initiative_id = ? AND goal_id <> ?
    ORDER BY goal_id ASC
  `).all(existing.initiative_id, existing.goal_id);

  if (peers.length === 0) {
    return { editedWeight: 100, adjustedGoals: [] };
  }

  const editedWeightUnits = Math.round(Number(requestedWeight) * 100);
  const editedWeight = editedWeightUnits / 100;
  const remainingWeightUnits = 10_000 - editedWeightUnits;
  const peerWeightTotal = peers.reduce((sum, peer) => sum + Math.max(0, Number(peer.weight) || 0), 0);
  const allocations = peers.map((peer) => {
    const exactWeightUnits = peerWeightTotal > 0
      ? remainingWeightUnits * (Math.max(0, Number(peer.weight) || 0) / peerWeightTotal)
      : remainingWeightUnits / peers.length;

    return {
      goal_id: peer.goal_id,
      weightUnits: Math.floor(exactWeightUnits),
      remainder: exactWeightUnits - Math.floor(exactWeightUnits),
    };
  });

  const unitsToAllocate = remainingWeightUnits - allocations.reduce((sum, allocation) => sum + allocation.weightUnits, 0);
  const allocationPriority = [...allocations].sort((a, b) =>
    b.remainder - a.remainder || a.goal_id - b.goal_id
  );

  for (let index = 0; index < unitsToAllocate; index += 1) {
    allocationPriority[index].weightUnits += 1;
  }

  const adjustedGoals = allocations.map(({ goal_id, weightUnits }) => {
    const weight = weightUnits / 100;

    db.prepare(`
      UPDATE initiative_goal
      SET weight = ?, updated_at = datetime('now')
      WHERE goal_id = ?
    `).run(weight, goal_id);

    return { goal_id, weight };
  });

  return { editedWeight, adjustedGoals };
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
    return { error: 'Weight must be between 0 and 100 with no more than two decimal places' };
  }

  let adjustedGoals = [];
  if (updates.weight !== undefined && Number(updates.weight) !== Number(existing.weight)) {
    const rebalanced = rebalanceGoalWeights(db, existing, updates.weight);
    updates = { ...updates, weight: rebalanced.editedWeight };
    adjustedGoals = rebalanced.adjustedGoals;
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
      adjusted_goal_weights: adjustedGoals,
    },
  });

  if (computeGoalScore(existing) < 100 && computeGoalScore(updatedGoal) >= 100) {
    logAudit(db, {
      event: 'goal.met',
      userEmail,
      targetType: 'goal',
      targetId: String(goal_id),
      payload: {
        goal_name: updatedGoal.goal_name,
        initiative_id: updatedGoal.initiative_id,
        current_value: updatedGoal.current_value,
        target_value: updatedGoal.target_value,
      },
    });
  }

  return { goal: updatedGoal, adjustedGoals };
}

export { ALLOWED_FIELDS, computeGoalScore, rebalanceGoalWeights };
