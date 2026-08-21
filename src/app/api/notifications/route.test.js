const getServiceContainerMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => getServiceContainerMock(),
}));

vi.mock('@/lib/auth/server-auth', () => ({
  requireAuth: (...args) => requireAuthMock(...args),
}));

import { GET } from '@/app/api/notifications/route';

function mkRequest() {
  return new Request('http://localhost:3000/api/notifications');
}

describe('/api/notifications GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'));
    prepareMock.mockReset();
    requireAuthMock.mockReset();
    getServiceContainerMock.mockReturnValue({ db: { prepare: prepareMock } });
    requireAuthMock.mockReturnValue({
      user: { user_id: 3, email: 'public@test.com', user_type: 'public' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns only whitelisted audit activity', async () => {
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('FROM audit_log')) {
        return {
          all: () => [
            { audit_id: 7, event: 'form.created', payload: '{"title":"Spring Survey"}', created_at: '2026-04-11T10:00:00.000Z' },
            { audit_id: 8, event: 'report.deleted', payload: '{"name":"Old Report"}', created_at: '2026-04-11T09:00:00.000Z' },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await GET(mkRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notifications.map((notification) => notification.id)).toEqual([
      'activity-7',
      'activity-8',
    ]);
  });
});
