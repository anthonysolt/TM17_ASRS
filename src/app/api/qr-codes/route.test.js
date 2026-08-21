const prepareMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const initializeDatabaseMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: { prepare: prepareMock },
  initializeDatabase: initializeDatabaseMock,
}));

vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: requirePermissionMock,
  requireAuth: requirePermissionMock,
}));

import { GET, DELETE } from '@/app/api/qr-codes/route';

describe('/api/qr-codes GET', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    requirePermissionMock.mockReset();
    initializeDatabaseMock.mockClear();
  });

  test('returns 401 when user is unauthorized', async () => {
    requirePermissionMock.mockReturnValue({ error: new Response(null, { status: 401 }) });

    const req = new Request('http://localhost:3000/api/qr-codes');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  test('returns transformed QR code list with stats', async () => {
    requirePermissionMock.mockReturnValue({ user: { user_id: 1, permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } });

    prepareMock.mockReturnValue({
      all: vi.fn(() => [
        {
          qr_code_id: 10,
          qr_code_key: 'qr_abc',
          qr_type: 'report',
          target_id: '7',
          target_url: 'https://example.com/report/7',
          description: 'test',
          created_at: '2026-03-01T00:00:00.000Z',
          expires_at: null,
          is_active: 1,
          template_title: null,
          total_scans: 4,
          conversions: 1,
          last_scanned_at: '2026-03-02T00:00:00.000Z',
        },
      ]),
    });

    const req = new Request('http://localhost:3000/api/qr-codes?scope=report');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.qrCodes).toHaveLength(1);
    expect(payload.qrCodes[0].stats.conversionRate).toBe(25);
    expect(payload.qrCodes[0].isActive).toBe(true);
  });

  test('DELETE removes a QR code by key', async () => {
    requirePermissionMock.mockReturnValue({ user: { email: 'staff@example.com' } });
    const deleteRun = vi.fn();
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('SELECT qr_code_id')) {
        return { get: vi.fn(() => ({ qr_code_id: 10, qr_code_key: 'qr_abc', qr_type: 'survey_template', target_id: 4 })) };
      }
      if (sql.includes('DELETE FROM qr_codes')) return { run: deleteRun };
      return { run: vi.fn() };
    });

    const res = await DELETE(new Request('http://localhost:3000/api/qr-codes?qrCodeKey=qr_abc', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(deleteRun).toHaveBeenCalledWith(10);
    expect(await res.json()).toEqual({ success: true, qrCodeKey: 'qr_abc' });
  });
});
