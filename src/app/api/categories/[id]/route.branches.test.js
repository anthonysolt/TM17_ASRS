const prepareMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { prepare: prepareMock }, initializeDatabase: vi.fn() }));
vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: () => ({ user: { permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
  requireAuth: () => ({ user: { permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
}));
import { GET, PUT, DELETE } from '@/app/api/categories/[id]/route';

describe('/api/categories/:id extra branches', () => {
  beforeEach(() => prepareMock.mockReset());

  test('GET success path', async () => {
    prepareMock.mockReturnValue({ get: () => ({ category_id: 1 }) });
    expect((await GET(new Request('http://localhost:3000/api/categories/1'), { params: Promise.resolve({ id: '1' }) })).status).toBe(200);
  });

  test('PUT success path', async () => {
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM category WHERE category_id = ?')) return { get: () => ({ category_id: 1, category_name: 'A', description: null }) };
      if (query.includes('UPDATE category SET')) return { run: vi.fn() };
      return { get: () => ({ category_id: 1, category_name: 'A' }), run: vi.fn() };
    });
    const req = new Request('http://localhost:3000/api/categories/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'd' }) });
    expect((await PUT(req, { params: Promise.resolve({ id: '1' }) })).status).toBe(200);
  });

  test('DELETE success path', async () => {
    prepareMock.mockImplementation((sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM category WHERE category_id = ?')) return { get: () => ({ category_name: 'A' }) };
      if (query.includes('DELETE FROM category')) return { run: vi.fn() };
      // The route lists linked initiatives (for the audit log) before deleting.
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    });
    expect((await DELETE(new Request('http://localhost:3000/api/categories/1'), { params: Promise.resolve({ id: '1' }) })).status).toBe(200);
  });
});
