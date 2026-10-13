const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  exec: (...args) => state.db.exec(...args),
}));
const requirePermissionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: dbProxy,
  default: dbProxy,
  initializeDatabase: vi.fn(),
}));

vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: (...args) => requirePermissionMock(...args),
}));

import { GET } from '@/app/api/initiatives/[id]/report-goals/route';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

const get = (id) => GET(
  new Request(`http://localhost:3000/api/initiatives/${id}/report-goals`),
  { params: Promise.resolve({ id: String(id) }) }
);

describe('/api/initiatives/:id/report-goals GET', () => {
  beforeEach(() => {
    state.db = createTestDb();
    requirePermissionMock.mockReset();
    requirePermissionMock.mockReturnValue({ user: { email: 'staff@example.com' } });
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  test('requires the report creation permission', async () => {
    requirePermissionMock.mockReturnValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await get(1)).status).toBe(403);
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'reports.create');
  });

  test('rejects an invalid id and an unknown initiative', async () => {
    expect((await get('abc')).status).toBe(400);
    expect((await get(99)).status).toBe(404);
  });

  test('returns the initiative\'s goals with scores', async () => {
    const initiativeId = insertInitiative(state.db);
    state.db.prepare(`
      INSERT INTO initiative_goal (initiative_id, goal_name, target_metric, target_value, current_value, weight, scoring_method)
      VALUES (?, 'Participation', '', 200, 50, 100, 'linear')
    `).run(initiativeId);

    const res = await get(initiativeId);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.goals).toEqual([expect.objectContaining({ goal_name: 'Participation', score: 25 })]);
  });
});
