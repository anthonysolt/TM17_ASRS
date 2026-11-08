const state = vi.hoisted(() => ({ db: null }));

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({ db: state.db }),
}));

import { GET } from '@/app/api/reports/[id]/route';
import { closeTestDb, createTestDb, insertReport } from '@/test/integration/api-test-harness';

describe('/api/reports/:id GET integration', () => {
  beforeEach(() => {
    state.db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  test('returns 404 when report does not exist', async () => {
    const res = await GET(new Request('http://localhost:3000/api/reports/2'), {
      params: Promise.resolve({ id: '2' }),
    });

    expect(res.status).toBe(404);
  });

  test('returns report detail when report exists', async () => {
    const reportId = insertReport(state.db, { name: 'Ops Report', status: 'completed' });

    const res = await GET(new Request(`http://localhost:3000/api/reports/${reportId}`), {
      params: Promise.resolve({ id: String(reportId) }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.report.id).toBe(reportId);
    expect(payload.report.name).toBe('Ops Report');
    // The detail includes the saved snapshot (the list does not).
    expect(payload.report).toHaveProperty('report_data');
  });
});
