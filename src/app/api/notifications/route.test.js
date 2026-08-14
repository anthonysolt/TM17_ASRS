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

  test('returns only active surveys and published reports for public users', async () => {
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('FROM survey_distribution')) {
        return {
          all: () => [
            {
              distribution_id: 7,
              title: 'Spring Student Voice Survey',
              initiative_name: 'E-Gaming and Careers',
              created_at: '2026-04-11T10:00:00.000Z',
              start_date: '2026-04-10',
              end_date: '2026-04-20',
              status: 'active',
            },
          ],
        };
      }
      if (sql.includes('FROM reports')) {
        return {
          all: () => [
            { id: 2, name: 'Published Report', status: 'published', created_at: '2026-04-11T09:00:00.000Z' },
            { id: 3, name: 'Draft Report', status: 'draft', created_at: '2026-04-11T11:00:00.000Z' },
          ],
        };
      }
      if (sql.includes('FROM surveys')) {
        return { all: () => [{ id: 1, name: 'Submission', email: 'x@test.com', submitted_at: '2026-04-11T12:00:00.000Z' }] };
      }
      if (sql.includes('FROM initiative')) {
        return { all: () => [{ initiative_id: 9, initiative_name: 'Should Not Show' }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await GET(mkRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notifications.map((notification) => notification.id)).toEqual([
      'survey-distribution-7',
      'report-2',
    ]);
  });
});
