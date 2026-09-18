import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { performGoalUpdate, rebalanceGoalWeights } from './perform-goal-update';

function createWeightDb(goals) {
  return {
    prepare(sql) {
      const query = String(sql);
      if (query.includes('SELECT goal_id, weight')) {
        return {
          all: (initiativeId, excludedGoalId) => goals
            .filter((goal) => goal.initiative_id === initiativeId && goal.goal_id !== excludedGoalId)
            .sort((a, b) => a.goal_id - b.goal_id),
        };
      }
      if (query.includes('UPDATE initiative_goal')) {
        return {
          run: (weight, goalId) => {
            goals.find((goal) => goal.goal_id === goalId).weight = weight;
          },
        };
      }
      throw new Error(`Unexpected SQL: ${query}`);
    },
  };
}

describe('rebalanceGoalWeights', () => {
  test('scales peer weights proportionally to hundredths of a percent', () => {
    const goals = [
      { goal_id: 1, initiative_id: 10, weight: 50 },
      { goal_id: 2, initiative_id: 10, weight: 25 },
      { goal_id: 3, initiative_id: 10, weight: 25 },
    ];

    const result = rebalanceGoalWeights(createWeightDb(goals), goals[0], 75);

    expect(result).toEqual({
      editedWeight: 75,
      adjustedGoals: [
        { goal_id: 2, weight: 12.5 },
        { goal_id: 3, weight: 12.5 },
      ],
    });
    expect(goals.slice(1).map((goal) => goal.weight)).toEqual([12.5, 12.5]);
  });

  test('splits the remainder evenly when all peer weights are zero', () => {
    const goals = [
      { goal_id: 1, initiative_id: 10, weight: 100 },
      { goal_id: 2, initiative_id: 10, weight: 0 },
      { goal_id: 3, initiative_id: 10, weight: 0 },
    ];

    const result = rebalanceGoalWeights(createWeightDb(goals), goals[0], 60);
    expect(result.adjustedGoals.map((goal) => goal.weight)).toEqual([20, 20]);
  });

  test('keeps a single goal at 100 percent', () => {
    const goals = [{ goal_id: 1, initiative_id: 10, weight: 100 }];
    expect(rebalanceGoalWeights(createWeightDb(goals), goals[0], 40)).toEqual({
      editedWeight: 100,
      adjustedGoals: [],
    });
  });

  test('uses largest remainders and keeps two-decimal weights at exactly 100 percent', () => {
    const goals = [
      { goal_id: 1, initiative_id: 10, weight: 40 },
      { goal_id: 2, initiative_id: 10, weight: 30 },
      { goal_id: 3, initiative_id: 10, weight: 20 },
      { goal_id: 4, initiative_id: 10, weight: 10 },
    ];

    const result = rebalanceGoalWeights(createWeightDb(goals), goals[0], 57);
    const allWeights = [result.editedWeight, ...result.adjustedGoals.map((goal) => goal.weight)];

    expect(result.adjustedGoals).toEqual([
      { goal_id: 2, weight: 21.5 },
      { goal_id: 3, weight: 14.33 },
      { goal_id: 4, weight: 7.17 },
    ]);
    expect(allWeights.every((weight) => Number.isInteger(weight * 100))).toBe(true);
    expect(allWeights.reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });
});

describe('performGoalUpdate weight validation', () => {
  test('rejects weights with more than two decimal places before updating the database', () => {
    const db = { prepare: vi.fn() };
    const existing = { goal_id: 1, weight: 20 };

    expect(performGoalUpdate(db, existing, { weight: 12.345 }, { userEmail: 'staff@test.com' })).toEqual({
      error: 'Weight must be between 0 and 100 with no more than two decimal places',
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
