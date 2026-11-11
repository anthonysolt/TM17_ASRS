import { computeGoalScore, getOverallScoresByInitiative } from '@/lib/goals/perform-goal-update';

describe('computeGoalScore binary', () => {
  test('scores 100 only once the target is reached', () => {
    expect(computeGoalScore({ scoring_method: 'binary', current_value: 5.1, target_value: 6 })).toBe(0);
    expect(computeGoalScore({ scoring_method: 'binary', current_value: 6, target_value: 6 })).toBe(100);
    expect(computeGoalScore({ scoring_method: 'binary', current_value: 7, target_value: 6 })).toBe(100);
    expect(computeGoalScore({ scoring_method: 'binary', current_value: 0, target_value: 1 })).toBe(0);
    expect(computeGoalScore({ scoring_method: 'binary', current_value: 1, target_value: 1 })).toBe(100);
  });

  test('linear scoring is progress capped to 0-100', () => {
    expect(computeGoalScore({ scoring_method: 'linear', current_value: 25, target_value: 250 })).toBe(10);
    expect(computeGoalScore({ scoring_method: 'linear', current_value: 5.1, target_value: 6 })).toBeCloseTo(85);
    expect(computeGoalScore({ scoring_method: 'linear', current_value: 300, target_value: 250 })).toBe(100);
    expect(computeGoalScore({ scoring_method: 'linear', current_value: -5, target_value: 10 })).toBe(0);
    expect(computeGoalScore({ scoring_method: 'linear', current_value: 5, target_value: 0 })).toBe(0);
    expect(computeGoalScore({ scoring_method: 'linear', current_value: null, target_value: 10 })).toBe(0);
  });
});

describe('getOverallScoresByInitiative', () => {
  const goals = [
    // Work force Readiness: 100 x 45 + 0 x 45 + 0 x 10 -> 45
    { initiative_id: 8, current_value: 5, target_value: 5, weight: 45, scoring_method: 'linear' },
    { initiative_id: 8, current_value: 5.1, target_value: 6, weight: 45, scoring_method: 'binary' },
    { initiative_id: 8, current_value: 3.8, target_value: 4, weight: 10, scoring_method: 'binary' },
    { initiative_id: 2, current_value: 25, target_value: 250, weight: 100, scoring_method: 'linear' },
  ];
  const fakeDb = () => {
    const calls = [];
    return {
      calls,
      prepare: (sql) => ({ all: (...args) => { calls.push({ sql, args }); return goals.filter((g) => args.length === 0 || args.includes(g.initiative_id)); } }),
    };
  };

  test('weights each goal score like the Goals page', () => {
    const scores = getOverallScoresByInitiative(fakeDb());
    expect(scores.get(8)).toBe(45);
    expect(scores.get(2)).toBe(10);
    expect(scores.has(5)).toBe(false);
  });

  test('can be limited to some initiatives', () => {
    const db = fakeDb();
    const scores = getOverallScoresByInitiative(db, [2]);
    expect([...scores.keys()]).toEqual([2]);
    expect(db.calls[0].args).toEqual([2]);
    expect(getOverallScoresByInitiative(db, []).size).toBe(0);
  });
});
