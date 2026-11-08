import {
  applyQuestionFilters,
  buildQuestionChartData,
  computeTrendData,
  isQuestionFilterActive,
  matchesQuestionFilter,
  processReportData,
  rowsForAnalysis,
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

  describe('checkbox answers', () => {
    const rows = [
      { id: 1, Activities: ['Esports', 'Track'] },
      { id: 2, Activities: ['Track'] },
      { id: 3, Activities: null },
    ];

    test('charts count each ticked option', () => {
      const chartData = buildQuestionChartData(rows, [{ label: 'Activities', column: 'Activities', type: 'multiselect' }]);
      expect(chartData.Activities).toEqual([{ name: 'Track', value: 2 }, { name: 'Esports', value: 1 }]);
    });

    test('most popular answer counts options, not combinations', () => {
      const [result] = computeTrendData(rows, { variables: ['Activities'], method: 'most_popular', enabledCalc: true });
      expect(result.result).toBe('Track');
      expect(result.answerCount).toBe(2);
    });

    test('a filter matches when any ticked option matches', () => {
      expect(matchesQuestionFilter(['Esports', 'Track'], { values: ['esports'] })).toBe(true);
      expect(matchesQuestionFilter(['Track'], { values: ['Esports'] })).toBe(false);
      expect(applyQuestionFilters(rows, [{ column: 'Activities', filter: { scope: 'report', values: ['Esports'] } }]).map((row) => row.id)).toEqual([1]);
    });

    test('metrics treat checkbox options as categories', () => {
      const { metrics } = processReportData([{ Score: ['1', '2'] }, { Score: ['2'] }], {}, [], [], ['Score']);
      expect(metrics.categoryCounts.Score).toEqual({ 1: 1, 2: 2 });
      expect(metrics.numericAverages.Score).toBeUndefined();
    });
  });

  describe('question filters', () => {
    const answers = [
      { id: 1, 'Do you enjoy it?': 'Yes', 'How satisfied are you?': 5 },
      { id: 2, 'Do you enjoy it?': 'No', 'How satisfied are you?': 2 },
      { id: 3, 'Do you enjoy it?': 'yes ', 'How satisfied are you?': 4 },
      { id: 4, 'Do you enjoy it?': null, 'How satisfied are you?': null },
    ];
    const enjoy = 'Do you enjoy it?';
    const satisfied = 'How satisfied are you?';

    test('isQuestionFilterActive ignores empty filters', () => {
      expect(isQuestionFilterActive(null)).toBe(false);
      expect(isQuestionFilterActive({ scope: 'report', values: [] })).toBe(false);
      expect(isQuestionFilterActive({ scope: 'report' })).toBe(false);
      expect(isQuestionFilterActive({ scope: 'report', values: ['Yes'] })).toBe(true);
      expect(isQuestionFilterActive({ scope: 'report', max: 3 })).toBe(true);
    });

    test('matchesQuestionFilter handles checklists, ranges, open bounds and blanks', () => {
      expect(matchesQuestionFilter(' YES ', { values: ['Yes'] })).toBe(true);
      expect(matchesQuestionFilter('No', { values: ['Yes'] })).toBe(false);
      expect(matchesQuestionFilter(4, { min: 2, max: 4 })).toBe(true);
      expect(matchesQuestionFilter('5', { min: 2, max: 4 })).toBe(false);
      expect(matchesQuestionFilter(1, { max: 3 })).toBe(true);
      expect(matchesQuestionFilter(1, { min: 3 })).toBe(false);
      expect(matchesQuestionFilter(null, { min: 0 })).toBe(false);
      expect(matchesQuestionFilter('', { values: [''] })).toBe(false);
      expect(matchesQuestionFilter(null, null)).toBe(true);
    });

    test('applyQuestionFilters ANDs whole-report filters and skips question-scoped ones', () => {
      const result = applyQuestionFilters(answers, [
        { column: enjoy, filter: { scope: 'report', values: ['Yes'] } },
        { column: satisfied, filter: { scope: 'report', min: 5 } },
      ]);
      expect(result.map((row) => row.id)).toEqual([1]);

      const questionOnly = applyQuestionFilters(answers, [
        { column: enjoy, filter: { scope: 'question', values: ['No'] } },
      ]);
      expect(questionOnly).toHaveLength(4);
    });

    test('rowsForAnalysis narrows only question-scoped filters', () => {
      expect(rowsForAnalysis(answers, { column: satisfied, filter: { scope: 'question', min: 4 } }).map((row) => row.id)).toEqual([1, 3]);
      expect(rowsForAnalysis(answers, { column: satisfied, filter: { scope: 'report', min: 4 } })).toBe(answers);
    });

    test('processReportData counts question filters as filter drops', () => {
      const result = processReportData(answers, {}, [], [], [satisfied], [
        { column: enjoy, filter: { scope: 'report', values: ['Yes'] } },
      ]);
      expect(result.filteredData.map((row) => row.id)).toEqual([1, 3]);
      expect(result.explainability.inputRowCount).toBe(4);
      expect(result.explainability.afterFilterCount).toBe(2);
      expect(result.explainability.droppedByStep.filters).toBe(2);
      expect(result.metrics.totalRowsUnfiltered).toBe(4);
    });

    test('buildQuestionChartData buckets answers by question type', () => {
      const rows = [
        { choice: 'B', rating: 4.4, text: 'x', number: 3, single: 'only' },
        { choice: 'A', rating: 2, text: 'y', number: 1, single: 'only' },
        { choice: 'B', rating: 4, text: 'x', number: 3, single: 'only' },
        { choice: null, rating: null, text: null, number: null, single: null },
      ];
      const chartData = buildQuestionChartData(rows, [
        { label: 'Choice', column: 'choice', type: 'choice' },
        { label: 'Rating', column: 'rating', type: 'rating' },
        { label: 'Text', column: 'text', type: 'text' },
        { label: 'Number', column: 'number', type: 'number' },
        { label: 'Single', column: 'single', type: 'text' },
        { label: 'Date', column: 'choice', type: 'date' },
      ]);
      expect(chartData.Choice).toEqual([{ name: 'B', value: 2 }, { name: 'A', value: 1 }]);
      expect(chartData.Rating).toEqual([{ name: 'Rating 2', value: 1 }, { name: 'Rating 4', value: 2 }]);
      expect(chartData.Text).toEqual([{ name: 'x', value: 2 }, { name: 'y', value: 1 }]);
      expect(chartData.Number).toEqual([{ name: '1', value: 1 }, { name: '3', value: 2 }]);
      expect(chartData.Single).toBeUndefined();
      expect(chartData.Date).toBeUndefined();
    });

    test('buildQuestionChartData applies question-scoped filters to their own question', () => {
      const rows = [{ c: 'A', r: 1 }, { c: 'B', r: 5 }];
      const chartData = buildQuestionChartData(rows, [
        { label: 'C', column: 'c', type: 'choice' },
        { label: 'R', column: 'r', type: 'rating', filter: { scope: 'question', min: 3 } },
      ]);
      expect(chartData.C).toHaveLength(2);
      expect(chartData.R).toEqual([{ name: 'Rating 5', value: 1 }]);
    });
  });
});
