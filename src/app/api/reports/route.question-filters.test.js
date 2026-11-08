const prepareMock = vi.hoisted(() => vi.fn());
const querySelectedQuestionDataMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/query-helpers', async (importOriginal) => ({ submittedAtClause: (await importOriginal()).submittedAtClause, querySelectedQuestionData: querySelectedQuestionDataMock }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/db-alerts', () => ({ alertDb: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/openai-report-insights', () => ({ generateReportInsights: vi.fn() }));
vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: () => ({ user: { email: 'staff@example.com', permissions: ['reports.create'] } }),
}));
vi.mock('@/lib/container/service-container', async () => {
  const engine = await vi.importActual('@/lib/report-engine');
  return {
    getServiceContainer: () => ({
      db: { prepare: prepareMock },
      reportEngine: {
        computeTrendData: engine.computeTrendData,
        processReportData: engine.processReportData,
        validateTrendConfig: engine.validateTrendConfig,
      },
      eventBus: { publish: vi.fn() },
      clock: { nowIso: () => '2026-10-22T00:00:00.000Z', todayIsoDate: () => '2026-10-22' },
    }),
  };
});

import { POST } from '@/app/api/reports/route';

const ENJOY = 'Do you enjoy it?';
const SATISFIED = 'How satisfied are you?';

const tableData = [
  { id: 1, [ENJOY]: 'Yes', [SATISFIED]: 5 },
  { id: 2, [ENJOY]: 'No', [SATISFIED]: 1 },
  { id: 3, [ENJOY]: 'Yes', [SATISFIED]: 3 },
  { id: 4, [ENJOY]: 'No', [SATISFIED]: 2 },
  { id: 5, [ENJOY]: 'Yes', [SATISFIED]: 4 },
];

const questions = [
  { field_id: 10, field_label: ENJOY, field_type: 'yesno', column: ENJOY },
  { field_id: 11, field_label: SATISFIED, field_type: 'rating', column: SATISFIED },
];

let savedSnapshot = null;
let countQuery = null;
let avgQuery = null;

function postReport(questionSelections, extra = {}) {
  return POST(new Request('http://localhost:3000/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initiativeId: 2, name: 'Filtered', questionSelections, ...extra }),
  }));
}

describe('/api/reports POST question filters', () => {
  beforeEach(() => {
    savedSnapshot = null;
    countQuery = null;
    avgQuery = null;
    querySelectedQuestionDataMock.mockReturnValue({ tableData, questions });
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('FROM initiative WHERE initiative_id = ?')) {
        return { get: () => ({ initiative_id: 2, initiative_name: 'Initiative' }) };
      }
      if (query.includes('COUNT(*) as count FROM submission')) {
        return { get: (...args) => { countQuery = { sql: query, args }; return { count: 5 }; } };
      }
      if (query.includes('AVG(sv.value_number)')) {
        return { get: (...args) => { avgQuery = { sql: query, args }; return { avg_score: 3 }; } };
      }
      if (query.includes('COUNT(*) as count FROM form')) return { get: () => ({ count: 1 }) };
      if (query.includes('INSERT INTO report_generation_log')) return { run: () => ({ lastInsertRowid: 1 }) };
      if (query.includes('INSERT INTO reports')) {
        return {
          run: (...args) => {
            savedSnapshot = JSON.parse(args[5]);
            return { lastInsertRowid: 7 };
          },
        };
      }
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
  });

  test('response date range limits the loaded rows and headline count, and is saved on the report', async () => {
    const res = await postReport(
      [{ id: 10, method: 'most_popular' }, { id: 11, method: 'average' }],
      { startDate: '2026-01-01', endDate: '2026-03-31' },
    );
    expect(res.status).toBe(200);

    expect(querySelectedQuestionDataMock).toHaveBeenLastCalledWith(
      expect.anything(), 2, [10, 11], { startDate: '2026-01-01', endDate: '2026-03-31' },
    );
    expect(countQuery.sql).toContain('s.submitted_at >= ?');
    expect(countQuery.sql).toContain('s.submitted_at < ?');
    expect(countQuery.args).toEqual([2, '2026-01-01', '2026-04-01']);
    expect(avgQuery.args).toEqual([2, '2026-01-01', '2026-04-01']);
    expect(savedSnapshot.config.dateRange).toEqual({ startDate: '2026-01-01', endDate: '2026-03-31' });
  });

  test('without a date range every response counts and none is saved', async () => {
    const res = await postReport([{ id: 10, method: 'most_popular' }, { id: 11, method: 'average' }]);
    expect(res.status).toBe(200);
    expect(countQuery.args).toEqual([2]);
    expect(countQuery.sql).not.toContain('submitted_at');
    expect(avgQuery.args).toEqual([2]);
    expect(savedSnapshot.config.dateRange).toEqual({ startDate: null, endDate: null });
  });

  test('a From date after the To date is rejected', async () => {
    const res = await postReport(
      [{ id: 10, method: 'most_popular' }, { id: 11, method: 'average' }],
      { startDate: '2026-04-01', endDate: '2026-03-31' },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('after');
  });

  test('whole-report filter narrows rows, trends, charts and summary', async () => {
    const res = await postReport([
      { id: 10, method: 'most_popular', filter: { scope: 'report', values: ['Yes'] } },
      { id: 11, method: 'average' },
    ]);
    expect(res.status).toBe(200);

    const { config, results } = savedSnapshot;
    expect(results.filteredTableData.map((row) => row.id)).toEqual([1, 3, 5]);
    expect(results.explainability.droppedByStep.filters).toBe(2);
    expect(results.summary.totalParticipants).toBe(3);
    expect(results.summary.averageRating).toBe(4);
    expect(results.chartData[ENJOY]).toEqual([{ name: 'Yes', value: 3 }]);

    const satisfaction = results.trendData.find((trend) => trend.attributes.includes(SATISFIED));
    expect(satisfaction.result).toBe(4);
    expect(config.questionSelections[0].filter).toEqual({ scope: 'report', values: ['Yes'] });
    expect(config.questionSelections[1].filter).toBeNull();
  });

  test('whole-report filter without a selected rating question keeps the initiative average', async () => {
    querySelectedQuestionDataMock.mockReturnValue({ tableData, questions: [questions[0]] });
    const res = await postReport([
      { id: 10, method: 'most_popular', filter: { scope: 'report', values: ['Yes'] } },
    ]);
    expect(res.status).toBe(200);
    const { results } = savedSnapshot;
    expect(results.summary.totalParticipants).toBe(3);
    expect(results.summary.averageRating).toBe(3);
  });

  test('question-only filter changes just that question', async () => {
    const res = await postReport([
      { id: 10, method: 'most_popular' },
      { id: 11, method: 'average', filter: { scope: 'question', min: 3 } },
    ]);
    expect(res.status).toBe(200);

    const { config, results } = savedSnapshot;
    expect(results.filteredTableData).toHaveLength(5);
    expect(results.summary.totalParticipants).toBe(5);

    const satisfaction = results.trendData.find((trend) => trend.attributes.includes(SATISFIED));
    expect(satisfaction.result).toBe(4);
    expect(satisfaction.responsesEvaluated).toBe(3);

    const enjoyTrend = results.trendData.find((trend) => trend.attributes.includes(ENJOY));
    expect(enjoyTrend.responsesEvaluated).toBe(5);

    expect(results.chartData[SATISFIED].map((bucket) => bucket.name)).toEqual(['Rating 3', 'Rating 4', 'Rating 5']);
    expect(results.chartData[ENJOY]).toEqual([{ name: 'Yes', value: 3 }, { name: 'No', value: 2 }]);
    expect(config.questionSelections[1].filter).toEqual({ scope: 'question', min: 3 });
  });

  test('rejects a range filter with min above max', async () => {
    const res = await postReport([{ id: 11, method: 'average', filter: { scope: 'report', min: 5, max: 1 } }]);
    expect(res.status).toBe(400);
  });
});

