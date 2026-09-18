const prepareMock = vi.hoisted(() => vi.fn());
const publishMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({
  default: { prepare: prepareMock },
  db: { prepare: prepareMock },
  initializeDatabase: vi.fn(),
}));
vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: () => ({ user: { email: 'staff@test.com', permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
  requireAuth: () => ({ user: { email: 'staff@test.com', permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
}));
vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({ eventBus: { publish: publishMock } }),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { GET, POST, PUT, DELETE } from '@/app/api/goals/route';

describe('/api/goals branch coverage', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    publishMock.mockReset();
  });

  test('GET success computes scores across methods', async () => {
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('FROM initiative_goal')) {
        return {
          all: () => ([
            { scoring_method: 'linear', current_value: 20, target_value: 40, weight: 1, deadline: '2099-01-02' },
            { scoring_method: 'threshold', current_value: 5, target_value: 10, weight: 2, deadline: null },
            { scoring_method: 'binary', current_value: 1, target_value: 1, weight: 1, deadline: '2099-01-03' },
            { scoring_method: 'unknown', current_value: 1, target_value: 2, weight: 0, deadline: null },
          ]),
        };
      }
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    const res = await GET(new Request('http://localhost:3000/api/goals?initiativeId=1'));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.goals).toHaveLength(4);
  });

  test('POST rejects over-precision and out-of-range weights, then covers success', async () => {
    const mkReq = (body) => new Request('http://localhost:3000/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const base = { initiative_id: 1, goal_name: 'G', target_metric: 'M', target_value: 10, weight: 2.25, scoring_method: 'linear' };

    expect((await POST(mkReq({ ...base, weight: -0.01 }))).status).toBe(400);
    expect((await POST(mkReq({ ...base, weight: 100.01 }))).status).toBe(400);
    const overPrecisionResponse = await POST(mkReq({ ...base, weight: 12.345 }));
    expect(overPrecisionResponse.status).toBe(400);
    expect(await overPrecisionResponse.json()).toEqual({
      error: 'Weight must be between 0 and 100 with no more than two decimal places',
    });

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT initiative_id FROM initiative')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await POST(mkReq(base))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT initiative_id FROM initiative')) return { get: () => ({ initiative_id: 1 }) };
      if (query.includes('INSERT INTO initiative_goal')) return { run: () => ({ lastInsertRowid: 8 }) };
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => ({ goal_id: 8, scoring_method: 'linear', current_value: 5, target_value: 10, weight: 1, deadline: null }) };
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await POST(mkReq(base))).status).toBe(201);

  });

  test('PUT covers not found, no update fields, and success', async () => {
    const mkReq = (body) => new Request('http://localhost:3000/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn() };
    });
    expect((await PUT(mkReq({ goal_id: 1 }))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => ({ goal_id: 1 }) };
      return { get: vi.fn(), run: vi.fn() };
    });
    expect((await PUT(mkReq({ goal_id: 1 }))).status).toBe(400);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => ({ goal_id: 1, scoring_method: 'threshold', current_value: 3, target_value: 2, weight: 1, deadline: null }) };
      if (query.includes('UPDATE initiative_goal')) return { run: vi.fn() };
      return { get: () => ({ goal_id: 1, scoring_method: 'threshold', current_value: 3, target_value: 2, weight: 1, deadline: null }), run: vi.fn() };
    });
    expect((await PUT(mkReq({ goal_id: 1, goal_name: 'Renamed' }))).status).toBe(200);

  });

  test('PUT returns 409 when expected_updated_at does not match server (US-035)', async () => {
    const mkReq = (body) =>
      new Request('http://localhost:3000/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const existing = {
      goal_id: 1,
      initiative_id: 2,
      goal_name: 'G',
      description: '',
      target_metric: 'm',
      target_value: 10,
      current_value: 1,
      weight: 1,
      scoring_method: 'linear',
      deadline: null,
      updated_at: '2026-03-29 10:00:00',
    };

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) {
        return { get: () => existing };
      }
      if (query.includes('INSERT INTO goal_edit_conflict')) {
        return { run: () => ({ lastInsertRowid: 99 }) };
      }
      return { get: vi.fn(), run: vi.fn() };
    });

    const res = await PUT(
      mkReq({
        goal_id: 1,
        expected_updated_at: '2026-03-28 10:00:00',
        goal_name: 'New',
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(body.conflict_id).toBe(99);
    expect(publishMock).toHaveBeenCalled();
  });

  test('DELETE covers not found and success', async () => {
    const req = (url) => new Request(url, { method: 'DELETE' });

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => undefined };
      return { get: vi.fn(), run: vi.fn() };
    });
    expect((await DELETE(req('http://localhost:3000/api/goals?goalId=8'))).status).toBe(404);

    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM initiative_goal WHERE goal_id = ?')) return { get: () => ({ goal_id: 8 }) };
      if (query.includes('DELETE FROM initiative_goal')) return { run: vi.fn() };
      return { get: vi.fn(), run: vi.fn() };
    });
    expect((await DELETE(req('http://localhost:3000/api/goals?goalId=8'))).status).toBe(200);

  });
});
