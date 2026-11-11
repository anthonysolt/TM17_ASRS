/**
 * One entry per day that has a change. Each day's overall score uses every
 * goal's latest known value as of that day (carried forward from earlier days
 * or from before the range), weighted by the goal's current weight.
 * When goals have values from before the range, the timeline also starts with
 * an entry on `startDate` (YYYY-MM-DD) showing those values, so a range with no
 * changes still shows where every goal stood.
 */
export function buildTimeline(seedRows, dailyRows, goals, startDate = null) {
  const latest = new Map();
  for (const row of seedRows) {
    if (goals.has(row.goal_id)) latest.set(row.goal_id, row);
  }

  const byDay = new Map();
  for (const row of dailyRows) {
    if (!goals.has(row.goal_id)) continue;
    if (!byDay.has(row.day)) byDay.set(row.day, []);
    byDay.get(row.day).push(row);
  }

  if (startDate && latest.size > 0 && !byDay.has(startDate)) byDay.set(startDate, []);

  return [...byDay.keys()].sort().map((date) => {
    for (const row of byDay.get(date)) latest.set(row.goal_id, row);

    const goalBreakdown = [...latest.values()].map((row) => {
      const goal = goals.get(row.goal_id);
      return {
        goal_id: row.goal_id,
        goal_name: goal.goal_name,
        recorded_value: row.recorded_value,
        target_value: row.target_value,
        score: row.score,
        weight: goal.weight,
      };
    });

    let weightedSum = 0;
    let totalWeight = 0;
    for (const goal of goalBreakdown) {
      weightedSum += goal.score * goal.weight;
      totalWeight += goal.weight;
    }

    return {
      date,
      overallScore: totalWeight > 0 ? parseFloat((weightedSum / totalWeight).toFixed(2)) : 0,
      targetScore: 100,
      goalBreakdown,
    };
  });
}
