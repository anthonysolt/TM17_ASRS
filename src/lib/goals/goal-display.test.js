import {
  GOAL_EXPORT_HEADERS,
  buildGoalsCsvLines,
  buildGoalsHtmlTable,
  buildGoalsTsvLines,
  getGoalStatus,
  toGoalExportRows,
} from '@/lib/goals/goal-display';

const manualGoal = {
  goal_id: 1, goal_name: 'Participation', description: 'Reach "everyone"', weight: 60,
  target_value: 200, current_value: 150, scoring_method: 'linear', score: 75,
  source_root_field_id: null, source_method: null, source: null,
};
const sourcedGoal = {
  goal_id: 2, goal_name: 'Rating <4+>', description: '', weight: 40,
  target_value: 4, current_value: 4.5, scoring_method: 'threshold', score: 100,
  source_root_field_id: 9, source_method: 'average', source: { questionLabel: 'Rate us', value: 4.5 },
};

describe('goal-display', () => {
  test('status matches the Goals page badges', () => {
    expect(getGoalStatus(manualGoal)).toEqual({ label: 'On Track', pill: 'pill-green' });
    expect(getGoalStatus({ ...manualGoal, score: 40 }).label).toBe('Not Met');
    expect(getGoalStatus({ ...manualGoal, score: 100 }).label).toBe('Exceeded');
    expect(getGoalStatus(sourcedGoal).label).toBe('Exceeded');
    expect(getGoalStatus({ ...sourcedGoal, current_value: 4 }).label).toBe('Reached');
  });

  test('every download format shares the same goal rows', () => {
    const rows = toGoalExportRows([manualGoal, sourcedGoal]);
    expect(rows[0]).toEqual(['Participation', 'Reach "everyone"', 'Manual entry', '60%', '200', '150', '75%', 'On Track']);
    expect(rows[1]).toEqual(['Rating <4+>', '', 'Rate us · Average Answer', '40%', '4', '4.5', '112.5%', 'Exceeded']);
    expect(rows.every((row) => row.length === GOAL_EXPORT_HEADERS.length)).toBe(true);
  });

  test('CSV quotes every cell under a Goals title row', () => {
    const lines = buildGoalsCsvLines([manualGoal]);
    expect(lines[0]).toBe('"Goals"');
    expect(lines[1]).toBe(GOAL_EXPORT_HEADERS.map((header) => `"${header}"`).join(','));
    expect(lines[2]).toContain('"Reach ""everyone"""');
  });

  test('TSV and HTML keep cells intact and escaped', () => {
    const tsv = buildGoalsTsvLines([{ ...manualGoal, description: 'a\tb\nc' }]);
    expect(tsv[0]).toBe('Goals');
    expect(tsv[2].split('\t')).toHaveLength(GOAL_EXPORT_HEADERS.length);

    const html = buildGoalsHtmlTable([sourcedGoal]);
    expect(html).toContain('<table class="goals-table">');
    expect(html).toContain('Rating &lt;4+&gt;');
    expect(html).not.toContain('<4+>');
  });
});
