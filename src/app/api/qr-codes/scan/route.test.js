const state = vi.hoisted(() => ({
  db: null,
  publishMock: vi.fn(),
}));

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({
    db: state.db,
    eventBus: { publish: state.publishMock },
    clock: { nowIso: () => '2026-03-05T00:00:00.000Z' },
  }),
}));

import { GET, POST } from '@/app/api/qr-codes/scan/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
  insertQrCode,
} from '@/test/integration/api-test-harness';

describe('/api/qr-codes/scan integration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    state.db = createTestDb();
    state.publishMock.mockReset();
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('POST validates payload and returns 404 for unknown key', async () => {
    const badReq = new Request('http://localhost:3000/api/qr-codes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect((await POST(badReq)).status).toBe(400);

    const missingReq = new Request('http://localhost:3000/api/qr-codes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeKey: 'missing' }),
    });
    expect((await POST(missingReq)).status).toBe(404);
  });

  test('POST increments aggregate view and conversion counters without storing user data', async () => {
    insertQrCode(state.db, { qrCodeKey: 'qr_success_1', targetUrl: 'http://localhost:3000/survey/123' });

    const req = new Request('http://localhost:3000/api/qr-codes/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.1',
        'user-agent': 'vitest-agent',
        referer: 'http://localhost:3000/start',
      },
      body: JSON.stringify({ qrCodeKey: 'qr_success_1' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.qrCode.targetUrl).toBe('http://localhost:3000/survey/123');
    expect(state.publishMock).toHaveBeenCalledTimes(1);

    const conversionReq = new Request('http://localhost:3000/api/qr-codes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeKey: 'qr_success_1', convertedToSubmission: true }),
    });
    expect((await POST(conversionReq)).status).toBe(200);

    const counters = state.db.prepare(
      'SELECT qr_viewcount, qr_conversion FROM qr_codes WHERE qr_code_key = ?'
    ).get('qr_success_1');
    expect(counters).toEqual({ qr_viewcount: 1, qr_conversion: 1 });
    expect(state.publishMock).toHaveBeenCalledTimes(2);
  });

  test('GET requires auth and returns analytics when authorized', async () => {
    process.env.NODE_ENV = 'development';

    const noAuthRes = await GET(new Request('http://localhost:3000/api/qr-codes/scan?qrCodeKey=qr_unauth'));
    expect(noAuthRes.status).toBe(401);

    insertQrCode(state.db, { qrCodeKey: 'qr_stats_1' });
    state.db.prepare(
      'UPDATE qr_codes SET qr_viewcount = 2, qr_conversion = 1 WHERE qr_code_key = ?'
    ).run('qr_stats_1');

    const tokens = createSessionForRank(state.db, { rank: 50 });

    const res = await GET(new Request('http://localhost:3000/api/qr-codes/scan?qrCodeKey=qr_stats_1', {
      headers: createAuthedRequestHeaders(tokens),
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.stats.totalScans).toBe(2);
    expect(payload.stats).not.toHaveProperty('uniqueIPs');
    expect(payload.stats.conversions).toBe(1);
  });
});
