const prepareMock = vi.hoisted(() => vi.fn());
const initializeDatabaseMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  default: { prepare: prepareMock },
  db: { prepare: prepareMock },
  initializeDatabase: initializeDatabaseMock,
}));

vi.mock('@/lib/auth/server-auth', () => ({
  requirePermission: () => ({ user: { user_id: 2, user_type: 'staff', permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
  requireAuth: () => ({ user: { user_id: 2, user_type: 'staff', permissions: ['surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create', 'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view', 'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage'] } }),
}));

import { GET, POST, DELETE } from '@/app/api/surveys/distributions/route';

describe('/api/surveys/distributions date handling', () => {
  const RealDate = Date;

  function installFakeToday() {
    class FakeDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super('2026-02-24T10:00:00');
          this.__fromNow = true;
        } else {
          super(...args);
          this.__fromNow = false;
        }
      }

      toISOString() {
        if (this.__fromNow) {
          return '2026-02-25T02:00:00.000Z';
        }
        return super.toISOString();
      }
    }

    global.Date = FakeDate;
  }

  beforeEach(() => {
    prepareMock.mockReset();
    initializeDatabaseMock.mockReset();
    installFakeToday();
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  test('POST computes status using local date instead of UTC date string', async () => {
    const insertRun = vi.fn(() => ({ lastInsertRowid: 12 }));
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('INSERT INTO survey_distribution')) {
        return { run: insertRun };
      }
      return { run: vi.fn(), all: vi.fn(() => []) };
    });

    const req = new Request('http://localhost:3000/api/surveys/distributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        survey_template_id: 'tmpl-1',
        title: 'Window Test',
        start_date: '2026-02-24',
        end_date: '2026-02-25',
        recipient_emails: [],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.status).toBe('active');
    expect(insertRun).toHaveBeenCalledWith(
      'tmpl-1',
      'Window Test',
      '2026-02-24',
      '2026-02-25',
      'active',
      '[]',
      null
    );
  });

  test('GET computes active status from local date and persists status change', async () => {
    const selectAll = vi.fn(() => ([
      {
        distribution_id: 7,
        survey_template_id: 'tmpl-1',
        title: 'Window Test',
        start_date: '2026-02-24',
        end_date: '2026-02-24',
        status: 'pending',
        recipient_emails: '[]',
        response_count: 0,
        created_at: '2026-02-20T00:00:00.000Z',
        created_by_user_id: null,
      },
    ]));
    const updateRun = vi.fn();
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('SELECT * FROM survey_distribution')) {
        return { all: selectAll };
      }
      if (sql.includes('UPDATE survey_distribution SET status = ?')) {
        return { run: updateRun };
      }
      return { run: vi.fn(), all: vi.fn(() => []) };
    });

    const req = new Request('http://localhost:3000/api/surveys/distributions');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.distributions[0].status).toBe('active');
    expect(updateRun).toHaveBeenCalledWith('active', 7);
  });

  test('DELETE removes a distribution by id', async () => {
    const deleteRun = vi.fn();
    prepareMock.mockImplementation((sql) => {
      if (sql.includes('SELECT distribution_id')) {
        return { get: vi.fn(() => ({ distribution_id: 7, survey_template_id: 'tmpl-1', title: 'Window Test' })) };
      }
      if (sql.includes('DELETE FROM survey_distribution')) return { run: deleteRun };
      return { run: vi.fn() };
    });

    const res = await DELETE(new Request(
      'http://localhost:3000/api/surveys/distributions?distributionId=7',
      { method: 'DELETE' }
    ));
    expect(res.status).toBe(200);
    expect(deleteRun).toHaveBeenCalledWith(7);
    expect(await res.json()).toEqual({ success: true, distributionId: 7 });
  });
});
