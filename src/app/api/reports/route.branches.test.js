const prepareMock = vi.hoisted(() => vi.fn());
const validateReportCreatePayloadMock = vi.hoisted(() => vi.fn());
const validateReportDeleteParamsMock = vi.hoisted(() => vi.fn());
const validateReportQueryParamsMock = vi.hoisted(() => vi.fn());
const validateReportUpdatePayloadMock = vi.hoisted(() => vi.fn());
const querySelectedQuestionDataMock = vi.hoisted(() => vi.fn());
const toReportListItemDtoMock = vi.hoisted(() => vi.fn((r) => r));
const toReportDetailDtoMock = vi.hoisted(() => vi.fn((r) => r));
const requirePermissionMock = vi.hoisted(() => vi.fn(() => ({ user: { permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } })));

vi.mock('@/lib/report-validation', () => ({
  validateReportCreatePayload: validateReportCreatePayloadMock,
  validateReportDeleteParams: validateReportDeleteParamsMock,
  validateReportQueryParams: validateReportQueryParamsMock,
  validateReportUpdatePayload: validateReportUpdatePayloadMock,
}));

vi.mock('@/lib/query-helpers', () => ({ querySelectedQuestionData: querySelectedQuestionDataMock }));
vi.mock('@/lib/adapters/report-adapter', () => ({
  toReportListItemDto: toReportListItemDtoMock,
  toReportDetailDto: toReportDetailDtoMock,
}));

const publishMock = vi.hoisted(() => vi.fn());
const reportEngineMock = vi.hoisted(() => ({
  validateTrendConfig: vi.fn(),
  processReportData: vi.fn(),
  computeTrendData: vi.fn(),
}));

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({
    db: { prepare: prepareMock },
    reportEngine: reportEngineMock,
    eventBus: { publish: publishMock },
    clock: { nowIso: () => '2026-03-05T00:00:00.000Z', todayIsoDate: () => '2026-03-05' },
  }),
}));

vi.mock('@/lib/auth/server-auth', () => ({ requirePermission: requirePermissionMock, requireAuth: requirePermissionMock }));

import { GET, POST, PUT, DELETE } from '@/app/api/reports/route';

describe('/api/reports branch coverage', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    validateReportCreatePayloadMock.mockReset();
    validateReportDeleteParamsMock.mockReset();
    validateReportQueryParamsMock.mockReset();
    validateReportUpdatePayloadMock.mockReset();
    querySelectedQuestionDataMock.mockReset();
    toReportListItemDtoMock.mockClear();
    toReportDetailDtoMock.mockClear();
    requirePermissionMock.mockReset();
    requirePermissionMock.mockReturnValue({ user: { permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } });
    publishMock.mockReset();
    reportEngineMock.validateTrendConfig.mockReset();
    reportEngineMock.processReportData.mockReset();
    reportEngineMock.computeTrendData.mockReset();
  });

  test('GET success with and without initiativeId and catch', async () => {
    validateReportQueryParamsMock.mockReturnValueOnce({ valid: true, initiativeId: 2 }).mockReturnValueOnce({ valid: true });
    prepareMock.mockReturnValue({ all: () => ([{ id: 1 }]) });
    expect((await GET(new Request('http://localhost:3000/api/reports?initiativeId=2'))).status).toBe(200);
    expect((await GET(new Request('http://localhost:3000/api/reports'))).status).toBe(200);

    validateReportQueryParamsMock.mockImplementation(() => { throw new Error('bad'); });
    expect((await GET(new Request('http://localhost:3000/api/reports'))).status).toBe(500);
  });

  test('POST invalid payload, auth error, not found, trend invalid, success, catch after log start', async () => {
    const req = (body) => new Request('http://localhost:3000/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    validateReportCreatePayloadMock.mockReturnValueOnce({ valid: false, error: 'bad' });
    expect((await POST(req({}))).status).toBe(400);

    validateReportCreatePayloadMock.mockReturnValue({ valid: true, value: { initiativeId: 2, name: 'R1', questionSelections: [{ id: 5, method: 'delta_halves' }] } });
    requirePermissionMock.mockReturnValueOnce({ error: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) });
    expect((await POST(req({ initiativeId: 2 }))).status).toBe(403);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('FROM initiative WHERE initiative_id = ?')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await POST(req({ initiativeId: 2 }))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('FROM initiative WHERE initiative_id = ?')) return { get: () => ({ initiative_id: 2, initiative_name: 'I', attributes: '[]' }) };
      if (query.includes('COUNT(*) as count FROM submission')) return { get: () => ({ count: 3 }) };
      if (query.includes('AVG(sv.value_number)')) return { get: () => ({ avg_score: 4.2 }) };
      if (query.includes('COUNT(*) as count FROM form')) return { get: () => ({ count: 1 }) };
      if (query.includes('DISTINCT f.field_id')) return { all: () => [] };
      if (query.includes('INSERT INTO report_generation_log')) return { run: () => ({ lastInsertRowid: 99 }) };
      if (query.includes('UPDATE report_generation_log')) return { run: vi.fn() };
      if (query.includes('INSERT INTO reports')) return { run: () => ({ lastInsertRowid: 7 }) };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    querySelectedQuestionDataMock.mockReturnValue({ tableData: [{ Question: 1 }], questions: [{ field_id: 5, field_label: 'Question', column: 'Question' }] });
    reportEngineMock.validateTrendConfig.mockReturnValueOnce({ valid: false, error: 'trend bad' });
    expect((await POST(req({ initiativeId: 2 }))).status).toBe(400);

    reportEngineMock.validateTrendConfig.mockReturnValue({ valid: true, normalized: { variables: [] } });
    reportEngineMock.processReportData.mockReturnValue({ filteredData: [], metrics: {}, explainability: {} });
    reportEngineMock.computeTrendData.mockReturnValue([]);
    expect((await POST(req({ initiativeId: 2, name: 'R1' }))).status).toBe(200);

    reportEngineMock.processReportData.mockImplementationOnce(() => { throw new Error('boom'); });
    expect((await POST(req({ initiativeId: 2, name: 'R1' }))).status).toBe(500);
  });

  test('PUT and DELETE success/not-found/catch branches', async () => {
    const putReq = (body) => new Request('http://localhost:3000/api/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    validateReportUpdatePayloadMock.mockReturnValueOnce({ valid: false, error: 'bad' });
    expect((await PUT(putReq({}))).status).toBe(400);

    validateReportUpdatePayloadMock.mockReturnValue({ valid: true, value: { id: 1, name: 'N', description: 'D', status: 'completed' } });
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT id FROM reports WHERE id = ?')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await PUT(putReq({ id: 1 }))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT id FROM reports WHERE id = ?')) return { get: () => ({ id: 1 }) };
      if (query.includes('UPDATE reports SET')) return { run: vi.fn() };
      if (query.includes('WHERE r.id = ?')) return { get: () => ({ id: 1 }) };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await PUT(putReq({ id: 1 }))).status).toBe(200);

    validateReportUpdatePayloadMock.mockImplementationOnce(() => { throw new Error('boom'); });
    expect((await PUT(putReq({ id: 1 }))).status).toBe(500);

    const delReq = (url) => new Request(url, { method: 'DELETE' });
    validateReportDeleteParamsMock.mockReturnValueOnce({ valid: false, error: 'bad' });
    expect((await DELETE(delReq('http://localhost:3000/api/reports'))).status).toBe(400);

    validateReportDeleteParamsMock.mockReturnValue({ valid: true, id: 2 });
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT id FROM reports WHERE id = ?')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await DELETE(delReq('http://localhost:3000/api/reports?id=2'))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('FROM reports WHERE id = ?')) return { get: () => ({ id: 2, name: 'R' }), run: vi.fn() };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await DELETE(delReq('http://localhost:3000/api/reports?id=2'))).status).toBe(200);

    validateReportDeleteParamsMock.mockImplementationOnce(() => { throw new Error('boom'); });
    expect((await DELETE(delReq('http://localhost:3000/api/reports?id=2'))).status).toBe(500);
  });
});
