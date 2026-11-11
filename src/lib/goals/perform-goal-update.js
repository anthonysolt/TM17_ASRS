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
  'source_answer',
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
    case 'linear': {
      // Same progress as the Goal Progress column, capped at 100. A negative
      // value (e.g. a falling trend) scores 0 rather than pulling the overall
      // score below zero.
      const current = Number(current_value);
      const target = Number(target_value);
      if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
      return Math.min(Math.max((current / target) * 100, 0), 100);
    }
    case 'threshold':
      return current_value >= target_value ? 100 : 0;
    case 'binary':
      // Met or not: full credit only once the target is reached.
      return Number(current_value) >= Number(target_value) ? 100 : 0;
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

/** Linear and binary scores compare against the target, so it must be a positive number. */
export function getTargetValueError(targetValue, scoringMethod) {
  if (!['linear', 'binary'].includes(scoringMethod)) return null;
  const target = Number(targetValue);
  return Number.isFinite(target) && target > 0 ? null : 'Target value must be a number greater than 0';
}

/**
 * Apply a partial patch to an initiative_goal row. Records progress history when current_value changes.
 * @param {{ prepare(sql: string): { get(...values: unknown[]): unknown, run(...values: unknown[]): unknown } }} db
 * @param {Record<string, unknown>} existing - full row from initiative_goal
 * @param {Record<string, unknown>} updates - subset of allowed fields
 * @param {{ userEmail: string }} ctx
 */
export function performGoalUpdate(db, existing, updates, { userEmail, recordHistory = true }) {
  const goal_id = existing.goal_id;

  // Threshold is no longer offered; goals already using it may keep it.
  const allowedMethods = existing.scoring_method === 'threshold' ? ['linear', 'threshold', 'binary'] : ['linear', 'binary'];
  if (updates.scoring_method && !allowedMethods.includes(updates.scoring_method)) {
    return { error: 'Invalid scoring_method. Must be: linear or binary' };
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

  if (updates.current_value !== undefined && recordHistory) {
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

/**
 * An initiative's overall goal score: each goal's score weighted by its weight
 * (the score shown on the Goals page). 0 when there are no goals or no weight.
 */
function computeOverallScore(goals) {
  if (goals.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const goal of goals) {
    const score = computeGoalScore(goal);
    weightedSum += score * Number(goal.weight);
    totalWeight += Number(goal.weight);
  }

  if (totalWeight === 0) return 0;
  return parseFloat((weightedSum / totalWeight).toFixed(2));
}

/**
 * Overall goal score per initiative, as a Map of initiative_id to score.
 * Initiatives without goals are left out (callers show "no score").
 * initiativeIds: limit to these initiatives; omit for all.
 */
function getOverallScoresByInitiative(db, initiativeIds = null) {
  if (Array.isArray(initiativeIds) && initiativeIds.length === 0) return new Map();
  const filter = Array.isArray(initiativeIds) ? `WHERE initiative_id IN (${initiativeIds.map(() => '?').join(', ')})` : '';
  const goals = db.prepare(`
    SELECT initiative_id, current_value, target_value, weight, scoring_method
    FROM initiative_goal ${filter}
  `).all(...(initiativeIds || []));

  const byInitiative = new Map();
  for (const goal of goals) {
    if (!byInitiative.has(goal.initiative_id)) byInitiative.set(goal.initiative_id, []);
    byInitiative.get(goal.initiative_id).push(goal);
  }
  return new Map([...byInitiative].map(([id, list]) => [id, computeOverallScore(list)]));
}

export { ALLOWED_FIELDS, computeGoalScore, computeOverallScore, getOverallScoresByInitiative, rebalanceGoalWeights };
