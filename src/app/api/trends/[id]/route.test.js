// The route reads the trend table through the PostgreSQL client; mock it so
// no DATABASE_URL is needed.
const allMock = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({ prepare: vi.fn(() => ({ all: allMock, get: vi.fn(), run: vi.fn() })) }));
vi.mock('@/lib/db', () => ({ db: dbMock, default: dbMock, initializeDatabase: vi.fn() }));

import { GET } from '@/app/api/trends/[id]/route';

describe('/api/trends/:id GET', () => {
  beforeEach(() => {
    allMock.mockReset();
    dbMock.prepare.mockClear();
  });

  test('returns the initiative\'s displayed trends in API shape', async () => {
    allMock.mockReturnValue([{
      trend_key: 't1', report_id: 4, attributes: '["Score"]', direction: 'up', magnitude: 12.5,
      time_period: 'Q1', enabled_display: 1, enabled_calc: 0, description: 'Scores rose',
    }]);

    const res = await GET(new Request('http://localhost:3000/api/trends/12'), {
      params: Promise.resolve({ id: '12' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    // Only displayed trends are queried, for this initiative.
    expect(dbMock.prepare.mock.calls[0][0]).toContain('enabled_display = 1');
    expect(allMock).toHaveBeenCalledWith(12);
    expect(payload.trends).toEqual([{
      trendId: 't1', reportId: 4, attributes: ['Score'], direction: 'up', magnitude: 12.5,
      timePeriod: 'Q1', enabledDisplay: true, enabledCalc: false, description: 'Scores rose',
    }]);
  });

  test('returns 500 when the query fails', async () => {
    allMock.mockImplementation(() => { throw new Error('db down'); });
    const res = await GET(new Request('http://localhost:3000/api/trends/12'), {
      params: Promise.resolve({ id: '12' }),
    });
    expect(res.status).toBe(500);
  });
});
