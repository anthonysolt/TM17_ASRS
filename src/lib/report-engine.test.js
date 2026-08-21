import {
  computeTrendData,
  processReportData,
  validateTrendConfig,
} from '@/lib/report-engine';

describe('report-engine', () => {
  const rows = [
    { id: 1, grade: '7th', score: 10, attendanceRate: '80%' },
    { id: 2, grade: '7th', score: 20, attendanceRate: '82%' },
    { id: 3, grade: '8th', score: 30, attendanceRate: '85%' },
    { id: 4, grade: '8th', score: 40, attendanceRate: '90%' },
  ];

  test('processReportData returns explainability counts', () => {
    const result = processReportData(
      rows,
      { Grade: '7th' },
      [],
      [],
      ['Grade', 'Score', 'Attendance Rate']
    );
    expect(result.explainability.inputRowCount).toBe(4);
    expect(result.explainability.afterFilterCount).toBe(2);
    expect(result.explainability.outputRowCount).toBe(2);
  });

  test('validateTrendConfig enforces max variables', () => {
    const valid = validateTrendConfig(
      { variables: ['A', 'B'], method: 'linear_slope', thresholdPct: 3 },
      ['A', 'B', 'C']
    );
    expect(valid.valid).toBe(true);

    const invalid = validateTrendConfig(
      { variables: ['A', 'B', 'C', 'D', 'E', 'F'] },
      ['A', 'B', 'C', 'D', 'E', 'F']
    );
    expect(invalid.valid).toBe(false);
  });

  test('computeTrendData produces deterministic trend id and confidence', () => {
    const configResult = validateTrendConfig({
      variables: ['Score', 'Attendance Rate'],
      enabledCalc: true,
      enabledDisplay: true,
      method: 'delta_halves',
      thresholdPct: 2,
    }, ['Grade', 'Score', 'Attendance Rate']);
    expect(configResult.valid).toBe(true);

    const first = computeTrendData(rows, configResult.normalized, { initiativeId: 1, reportName: 'R1' });
    const second = computeTrendData(rows, configResult.normalized, { initiativeId: 1, reportName: 'R1' });
    expect(first[0].trendId).toBe(second[0].trendId);
    expect(first[0].confidenceScore).toBeGreaterThanOrEqual(0);
    expect(first[0].confidenceScore).toBeLessThanOrEqual(100);
  });

  test('computeTrendData handles empty and short datasets as stable with zero confidence', () => {
    const configResult = validateTrendConfig(
      { variables: ['Score'], method: 'delta_halves', thresholdPct: 2 },
      ['Score']
    );
    expect(configResult.valid).toBe(true);

    const empty = computeTrendData([], configResult.normalized, { initiativeId: 2, reportName: 'Empty' });
    const short = computeTrendData([{ score: 10 }, { score: 20 }, { score: 30 }], configResult.normalized);

    expect(empty).toHaveLength(1);
    expect(empty[0].direction).toBe('stable');
    expect(empty[0].confidenceScore).toBe(0);

    expect(short).toHaveLength(1);
    expect(short[0].direction).toBe('stable');
    expect(short[0].confidenceScore).toBe(0);
  });

  test('computeTrendData skips malformed values and still computes categorical trend when possible', () => {
    const configResult = validateTrendConfig(
      { variables: ['Score', 'Status'], method: 'delta_halves', thresholdPct: 1 },
      ['Score', 'Status']
    );
    expect(configResult.valid).toBe(true);

    const mixedRows = [
      { score: 'n/a', status: 'low' },
      { score: null, status: 'low' },
      { score: undefined, status: 'low' },
      { score: '', status: 'high' },
      { score: 'bad', status: 'high' },
      { score: 'bad2', status: 'high' },
    ];

    const trends = computeTrendData(mixedRows, configResult.normalized, { reportName: 'Mixed' });
    expect(trends).toHaveLength(1);
    expect(trends[0].direction).toBe('down');
    expect(trends[0].confidenceScore).toBeGreaterThan(0);
    expect(trends[0].description).toContain('skipped');
  });

  test('computeTrendData handles boundary threshold for stable vs direction', () => {
    const rowsBoundary = [
      { score: 100 },
      { score: 100 },
      { score: 102 },
      { score: 102 },
    ];

    const stableConfig = validateTrendConfig(
      { variables: ['Score'], method: 'delta_halves', thresholdPct: 2 },
      ['Score']
    );
    expect(stableConfig.valid).toBe(true);
    const stableTrend = computeTrendData(rowsBoundary, stableConfig.normalized);
    expect(stableTrend[0].direction).toBe('stable');

    const upConfig = validateTrendConfig(
      { variables: ['Score'], method: 'delta_halves', thresholdPct: 1.9 },
      ['Score']
    );
    expect(upConfig.valid).toBe(true);
    const upTrend = computeTrendData(rowsBoundary, upConfig.normalized);
    expect(upTrend[0].direction).toBe('up');
  });

  test.each([
    ['most_popular', 'Blue', 2],
    ['least_common', 'Red', 1],
  ])('computes %s answers from short categorical datasets', (method, expected, count) => {
    const config = validateTrendConfig(
      { variables: ['Favorite Color'], method },
      ['Favorite Color']
    );
    const result = computeTrendData([
      { 'Favorite Color': 'Blue' },
      { 'Favorite Color': 'Red' },
      { 'Favorite Color': 'Blue' },
    ], config.normalized);

    expect(result[0].analysisType).toBe(method);
    expect(result[0].result).toBe(expected);
    expect(result[0].answerCount).toBe(count);
    expect(result[0].responsesEvaluated).toBe(3);
  });

  test('computes the average of numeric answers and ignores non-numeric answers', () => {
    const config = validateTrendConfig(
      { variables: ['Rating'], method: 'average' },
      ['Rating']
    );
    const result = computeTrendData([
      { Rating: 2 },
      { Rating: '4' },
      { Rating: 'not answered' },
      { Rating: 6 },
    ], config.normalized);

    expect(result[0].analysisType).toBe('average');
    expect(result[0].result).toBe(4);
    expect(result[0].responsesEvaluated).toBe(3);
  });
});
