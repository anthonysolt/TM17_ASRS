import { buildTimeline } from '@/lib/goals/goal-history';

const goals = new Map([
  [1, { goal_id: 1, goal_name: 'A', weight: 50 }],
  [2, { goal_id: 2, goal_name: 'B', weight: 50 }],
]);
const row = (goal_id, day, score) => ({ goal_id, day, score, recorded_value: score, target_value: 100 });

describe('buildTimeline', () => {
  test('carries forward goals that did not change on a day', () => {
    const timeline = buildTimeline([], [row(1, '2026-01-01', 40), row(2, '2026-01-01', 80), row(1, '2026-01-02', 60)], goals);
    expect(timeline.map((entry) => [entry.date, entry.overallScore])).toEqual([
      ['2026-01-01', 60],
      ['2026-01-02', 70],
    ]);
    expect(timeline[1].goalBreakdown.find((goal) => goal.goal_id === 2).score).toBe(80);
  });

  test('starts from values recorded before the range', () => {
    const timeline = buildTimeline([row(2, '2025-06-01', 100)], [row(1, '2026-01-01', 0)], goals);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].overallScore).toBe(50);
  });

  test('ignores history of goals that no longer exist and sorts days', () => {
    const timeline = buildTimeline([], [row(9, '2026-01-01', 10), row(1, '2026-01-03', 20), row(1, '2026-01-02', 10)], goals);
    expect(timeline.map((entry) => entry.date)).toEqual(['2026-01-02', '2026-01-03']);
    expect(timeline[1].goalBreakdown).toHaveLength(1);
  });

  test('returns [] without history', () => {
    expect(buildTimeline([], [], goals)).toEqual([]);
  });

  test('starts at the range start with values from before the range', () => {
    const timeline = buildTimeline([row(1, '2025-01-01', 40), row(2, '2025-02-01', 80)], [], goals, '2026-01-01');
    expect(timeline).toEqual([expect.objectContaining({ date: '2026-01-01', overallScore: 60 })]);
    expect(timeline[0].goalBreakdown).toHaveLength(2);
  });

  test('no start entry without earlier values, and no duplicate when the start day has changes', () => {
    expect(buildTimeline([], [], goals, '2026-01-01')).toEqual([]);
    const timeline = buildTimeline([row(1, '2025-01-01', 40)], [row(1, '2026-01-01', 90)], goals, '2026-01-01');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].goalBreakdown[0].score).toBe(90);
  });

  test('all-zero weights give an overall score of 0', () => {
    const zero = new Map([[1, { goal_id: 1, goal_name: 'A', weight: 0 }]]);
    expect(buildTimeline([], [row(1, '2026-01-01', 50)], zero)[0].overallScore).toBe(0);
  });
});
