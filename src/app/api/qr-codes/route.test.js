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

import { DELETE, GET } from '@/app/api/qr-codes/route';

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
          unique_ips: 2,
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
});

describe('/api/qr-codes DELETE', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    requirePermissionMock.mockReset();
  });

  test('returns 400 when qrCodeId is invalid', async () => {
    requirePermissionMock.mockReturnValue({ user: { email: 'admin@test.com' } });

    const res = await DELETE(new Request('http://localhost:3000/api/qr-codes?qrCodeId=bad', {
      method: 'DELETE',
    }));

    expect(res.status).toBe(400);
  });

  test('deletes a survey QR code and its audit entry', async () => {
    requirePermissionMock.mockReturnValue({ user: { email: 'admin@test.com' } });
    const deleteRun = vi.fn(() => ({ changes: 1 }));
    const auditRun = vi.fn(() => ({ changes: 1 }));
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('DELETE FROM qr_codes')) return { run: deleteRun };
      if (sql.includes('INSERT INTO audit_log')) return { run: auditRun };
      if (sql.includes('FROM qr_codes')) {
        return {
          get: vi.fn(() => ({
            qr_code_id: 12,
            qr_code_key: 'survey_qr_12',
            qr_type: 'survey_template',
            description: 'Spring survey',
          })),
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await DELETE(new Request('http://localhost:3000/api/qr-codes?qrCodeId=12', {
      method: 'DELETE',
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ success: true, qrCodeId: 12 });
    expect(deleteRun).toHaveBeenCalledWith(12);
    expect(auditRun).toHaveBeenCalledOnce();
  });

  test('does not delete report QR codes through the survey endpoint', async () => {
    requirePermissionMock.mockReturnValue({ user: { email: 'admin@test.com' } });
    prepareMock.mockReturnValue({ get: vi.fn(() => undefined) });

    const res = await DELETE(new Request('http://localhost:3000/api/qr-codes?qrCodeId=99', {
      method: 'DELETE',
    }));

    expect(res.status).toBe(404);
  });
});
