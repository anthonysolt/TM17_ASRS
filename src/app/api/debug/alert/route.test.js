// The route imports the PostgreSQL client; mock it so no DATABASE_URL is needed.
const dbMock = vi.hoisted(() => ({ prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) }));
vi.mock('@/lib/db', () => ({ db: dbMock, default: dbMock, initializeDatabase: vi.fn() }));
const alertDbMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/lib/db-alerts', () => ({
  alertDb: alertDbMock,
}));

import { POST } from '@/app/api/debug/alert/route';

describe('/api/debug/alert POST', () => {
  beforeEach(() => {
    alertDbMock.mockClear();
  });

  test('returns success for valid JSON payload', async () => {
    const req = new Request('http://localhost:3000/api/debug/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'boom' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(alertDbMock).toHaveBeenCalledTimes(1);
  });

  test('handles invalid JSON body gracefully', async () => {
    const req = new Request('http://localhost:3000/api/debug/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not-json',
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(alertDbMock).toHaveBeenCalledTimes(1);
  });
});
