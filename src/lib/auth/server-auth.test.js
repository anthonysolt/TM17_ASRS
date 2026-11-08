import {
  applySessionCookies,
  clearSessionCookies,
  createSession,
  getSessionTokenFromRequest,
  requireAccess,
  requireAuth,
  requirePermission,
  revokeSessionByToken,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/lib/auth/server-auth';

function mockDbForSession(row) {
  const run = vi.fn();
  return {
    prepare: vi.fn((sql) => {
      if (sql.includes('WHERE s.token_hash = ?')) return { get: vi.fn(() => row) };
      return { get: vi.fn(), run, all: vi.fn(() => []) };
    }),
    run,
  };
}

describe('server-auth helper', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  test('createSession writes session and returns tokens', () => {
    const run = vi.fn();
    const db = { prepare: vi.fn(() => ({ run })) };
    const result = createSession(db, 12);
    expect(result.token).toBeTruthy();
    expect(result.csrfToken).toBeTruthy();
    expect(run).toHaveBeenCalled();
  });

  test('requireAccess returns test user in test env', () => {
    process.env.NODE_ENV = 'test';
    const req = new Request('http://localhost:3000/api/x');
    const auth = requireAccess(req, { prepare: vi.fn() }, { minAccessRank: 100 });
    expect(auth.user.user_type).toBe('admin');
  });

  test('requireAccess returns unauthorized without valid session', () => {
    process.env.NODE_ENV = 'development';
    const db = mockDbForSession(null);
    const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
    const auth = requireAccess(req, db, { requireCsrf: false });
    expect(auth.error.status).toBe(401);
  });

  test('requireAccess checks rank and csrf', async () => {
    process.env.NODE_ENV = 'development';
    const goodRow = {
      session_id: 1,
      user_id: 9,
      csrf_token: 'abc',
      expires_at: '2099-01-01T00:00:00.000Z',
      absolute_expires_at: '2099-01-01T00:00:00.000Z',
      revoked_at: null,
      first_name: 'A',
      last_name: 'B',
      email: 'a@x.com',
      verified: 1,
      user_type: 'staff',
      access_rank: 50,
    };

    const lowRankDb = mockDbForSession({ ...goodRow, access_rank: 10 });
    const reqLow = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
    expect(requireAccess(reqLow, lowRankDb, { minAccessRank: 50, requireCsrf: false }).error.status).toBe(403);

    const csrfDb = mockDbForSession(goodRow);
    const reqNoCsrf = new Request('http://localhost:3000/api/x', { method: 'POST', headers: { cookie: `${SESSION_COOKIE_NAME}=tok; ${CSRF_COOKIE_NAME}=abc` } });
    expect(requireAccess(reqNoCsrf, csrfDb, { minAccessRank: 50 }).error.status).toBe(403);

    const reqBadCsrf = new Request('http://localhost:3000/api/x', { method: 'POST', headers: { cookie: `${SESSION_COOKIE_NAME}=tok; ${CSRF_COOKIE_NAME}=abc`, 'x-csrf-token': 'zzz' } });
    expect(requireAccess(reqBadCsrf, csrfDb, { minAccessRank: 50 }).error.status).toBe(403);

    const reqGood = new Request('http://localhost:3000/api/x', { method: 'POST', headers: { cookie: `${SESSION_COOKIE_NAME}=tok; ${CSRF_COOKIE_NAME}=abc`, 'x-csrf-token': 'abc' } });
    expect(requireAccess(reqGood, csrfDb, { minAccessRank: 50 }).user.email).toBe('a@x.com');
  });

  test('requireAccess revokes expired session', () => {
    process.env.NODE_ENV = 'development';
    const run = vi.fn();
    const db = {
      prepare: vi.fn((sql) => {
        if (sql.includes('WHERE s.token_hash = ?')) {
          return { get: vi.fn(() => ({
            session_id: 1,
            user_id: 9,
            csrf_token: 'abc',
            expires_at: '2000-01-01T00:00:00.000Z',
            absolute_expires_at: '2099-01-01T00:00:00.000Z',
            revoked_at: null,
            first_name: 'A', last_name: 'B', email: 'a@x.com', verified: 1, user_type: 'staff', access_rank: 50,
          })) };
        }
        return { run, get: vi.fn(), all: vi.fn(() => []) };
      }),
    };
    const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
    const auth = requireAccess(req, db, { requireCsrf: false });
    expect(auth.error.status).toBe(401);
    expect(run).toHaveBeenCalled();
  });

  test('requireAccess idle expiry boundary: valid at exact time, revoked after', () => {
    process.env.NODE_ENV = 'development';
    vi.useFakeTimers();
    const boundaryIso = '2026-03-05T00:00:00.000Z';
    const run = vi.fn();
    const db = {
      prepare: vi.fn((sql) => {
        if (sql.includes('WHERE s.token_hash = ?')) {
          return { get: vi.fn(() => ({
            session_id: 2,
            user_id: 9,
            csrf_token: 'abc',
            expires_at: boundaryIso,
            absolute_expires_at: '2026-03-06T00:00:00.000Z',
            revoked_at: null,
            first_name: 'A', last_name: 'B', email: 'a@x.com', verified: 1, user_type: 'staff', access_rank: 50,
          })) };
        }
        return { run, get: vi.fn(), all: vi.fn(() => []) };
      }),
    };

    vi.setSystemTime(new Date(boundaryIso));
    const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
    const atBoundary = requireAccess(req, db, { requireCsrf: false });
    expect(atBoundary.user.email).toBe('a@x.com');

    vi.setSystemTime(new Date('2026-03-05T00:00:00.001Z'));
    const afterBoundary = requireAccess(req, db, { requireCsrf: false });
    expect(afterBoundary.error.status).toBe(401);
    expect(run).toHaveBeenCalled();

    vi.useRealTimers();
  });

  describe('session last_seen_at refresh is throttled to once a minute', () => {
    const NOW = '2026-03-05T12:00:00.000Z';

    // Runs requireAuth for a valid session whose last_seen_at is `lastSeen`;
    // returns the UPDATE session ... last_seen_at calls it made.
    function touchesFor(lastSeen) {
      process.env.NODE_ENV = 'development';
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));
      const touches = [];
      const db = {
        prepare: vi.fn((sql) => {
          if (sql.includes('WHERE s.token_hash = ?')) {
            return { get: vi.fn(() => ({
              session_id: 3, user_id: 9, csrf_token: 'abc',
              expires_at: '2026-03-05T18:00:00.000Z',
              absolute_expires_at: '2026-03-10T00:00:00.000Z',
              revoked_at: null, last_seen_at: lastSeen,
              first_name: 'A', last_name: 'B', email: 'a@x.com', verified: 1, user_type: 'staff', access_rank: 50,
            })) };
          }
          if (sql.includes('SET last_seen_at')) return { run: vi.fn((...args) => touches.push(args)) };
          return { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
        }),
      };
      const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
      const auth = requireAuth(req, db, { requireCsrf: false });
      vi.useRealTimers();
      expect(auth.user.email).toBe('a@x.com');
      return touches;
    }

    test('skips the write when the session was seen under 60 seconds ago', () => {
      expect(touchesFor('2026-03-05T11:59:01.000Z')).toHaveLength(0);
    });

    test('writes once 60 seconds have passed, extending the idle expiry by 8 hours', () => {
      const touches = touchesFor('2026-03-05T11:59:00.000Z');
      expect(touches).toHaveLength(1);
      expect(touches[0]).toEqual([NOW, '2026-03-05T20:00:00.000Z', 3]);
    });

    test('writes when last_seen_at is missing or unparseable', () => {
      expect(touchesFor(null)).toHaveLength(1);
      expect(touchesFor('not a date')).toHaveLength(1);
    });
  });

  test('cookie helpers set and clear cookies and token extraction works', () => {
    const response = { cookies: { set: vi.fn() } };
    applySessionCookies(response, 'token', 'csrf');
    clearSessionCookies(response);
    expect(response.cookies.set).toHaveBeenCalled();

    const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=abc` } });
    expect(getSessionTokenFromRequest(req)).toBe('abc');
  });

  test('revokeSessionByToken no-op/active path', () => {
    const run = vi.fn();
    const db = { prepare: vi.fn(() => ({ run })) };
    revokeSessionByToken(db, null);
    expect(run).not.toHaveBeenCalled();
    revokeSessionByToken(db, 'token');
    expect(run).toHaveBeenCalled();
  });

  // ── requireAuth tests ──

  test('requireAuth returns test user with permissions in test env', () => {
    process.env.NODE_ENV = 'test';
    const req = new Request('http://localhost:3000/api/x');
    const auth = requireAuth(req, { prepare: vi.fn() });
    expect(auth.user.user_type).toBe('admin');
    expect(auth.user.permissions).toContain('surveys.take');
    expect(auth.user.permissions).toContain('users.manage');
    expect(auth.session).toBeDefined();
  });

  test('requireAuth returns unauthorized without valid session', () => {
    process.env.NODE_ENV = 'development';
    const db = mockDbForSession(null);
    const req = new Request('http://localhost:3000/api/x', { headers: { cookie: `${SESSION_COOKIE_NAME}=tok` } });
    const auth = requireAuth(req, db, { requireCsrf: false });
    expect(auth.error.status).toBe(401);
  });

  // ── requirePermission tests ──

  test('requirePermission returns test user with permissions in test env', () => {
    process.env.NODE_ENV = 'test';
    const req = new Request('http://localhost:3000/api/x');
    const auth = requirePermission(req, { prepare: vi.fn() }, 'goals.manage');
    expect(auth.user.permissions).toContain('goals.manage');
    expect(auth.error).toBeUndefined();
  });

  test('requirePermission returns forbidden when user lacks permission', () => {
    process.env.NODE_ENV = 'development';
    const goodRow = {
      session_id: 1,
      user_id: 9,
      csrf_token: 'abc',
      expires_at: '2099-01-01T00:00:00.000Z',
      absolute_expires_at: '2099-01-01T00:00:00.000Z',
      revoked_at: null,
      first_name: 'A',
      last_name: 'B',
      email: 'a@x.com',
      verified: 1,
      user_type: 'staff',
      access_rank: 50,
    };

    const db = {
      prepare: vi.fn((sql) => {
        if (sql.includes('WHERE s.token_hash = ?')) return { get: vi.fn(() => goodRow) };
        if (sql.includes('FROM role_permission')) return { all: vi.fn(() => []) };
        if (sql.includes('FROM user_permission')) return { all: vi.fn(() => []) };
        return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
      }),
    };

    const req = new Request('http://localhost:3000/api/x', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=tok` },
    });
    const auth = requirePermission(req, db, 'users.manage', { requireCsrf: false });
    expect(auth.error.status).toBe(403);
  });
});
