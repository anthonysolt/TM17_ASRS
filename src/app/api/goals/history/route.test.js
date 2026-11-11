const allMock = vi.hoisted(() => vi.fn(() => []));
vi.mock('@/lib/db', () => {
  const db = {
    prepare: (sql) => ({
      get: () => (sql.includes('FROM initiative WHERE') ? { initiative_id: 1, initiative_name: 'Init' } : undefined),
      all: (...args) => allMock(sql, ...args),
    }),
  };
  return { default: db, db, initializeDatabase: () => db };
});
vi.mock('@/lib/auth/server-auth', () => ({ requirePermission: () => ({ user: { email: 'a@b.c' } }) }));

import { GET } from '@/app/api/goals/history/route';

const get = (query) => GET(new Request(`http://localhost/api/goals/history?${query}`));

describe('GET /api/goals/history', () => {
  beforeEach(() => allMock.mockClear());

  test('rejects a malformed date', async () => {
    expect((await get('initiativeId=1&from=2026/01/01')).status).toBe(400);
  });

  test('rejects from after to', async () => {
    expect((await get('initiativeId=1&from=2026-02-01&to=2026-01-01')).status).toBe(400);
  });

  test('passes the range to the daily query and defaults to the last 12 months', async () => {
    const res = await get('initiativeId=1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.range.to).toBeNull();
    const daily = allMock.mock.calls.find(([sql]) => sql.includes('AS day'));
    expect(daily.slice(1)).toEqual(['1', body.range.from, null, null]);
  });

  test('rejects dates that do not exist', async () => {
    expect((await get('initiativeId=1&from=2026-02-31')).status).toBe(400);
    expect((await get('initiativeId=1&to=2026-13-01')).status).toBe(400);
  });

  test('with only a to date, covers the 12 months before it', async () => {
    const res = await get('initiativeId=1&to=2024-01-15');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toEqual({ from: '2023-01-15', to: '2024-01-15' });
    const seed = allMock.mock.calls.find(([sql]) => sql.includes('DISTINCT ON (gph.goal_id)\n'));
    expect(seed.slice(1)).toEqual(['1', '2023-01-15']);
    const daily = allMock.mock.calls.find(([sql]) => sql.includes('AS day'));
    expect(daily.slice(1)).toEqual(['1', '2023-01-15', '2024-01-15', '2024-01-15']);
  });
});
