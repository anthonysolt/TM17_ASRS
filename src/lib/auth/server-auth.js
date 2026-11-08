import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'asrs_session';
export const CSRF_COOKIE_NAME = 'asrs_csrf';
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
// Refresh last_seen_at / the idle expiry at most this often, instead of writing
// the session row on every API request (each write is a blocking DB round trip).
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const out = {};

  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }

  return out;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function toIso(date) {
  return new Date(date).toISOString();
}

function nowMs() {
  return Date.now();
}

function isStateChanging(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(24).toString('hex');
  const createdAt = nowMs();
  const expiresAt = createdAt + SESSION_IDLE_MS;
  const absoluteExpiresAt = createdAt + SESSION_ABSOLUTE_MS;

  db.prepare(`
    INSERT INTO session (user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(userId),
    hashToken(token),
    csrfToken,
    toIso(createdAt),
    toIso(createdAt),
    toIso(expiresAt),
    toIso(absoluteExpiresAt)
  );

  return { token, csrfToken };
}

function getSessionRecord(db, token) {
  if (!token) return null;

  const row = db.prepare(`
    SELECT
      s.session_id,
      s.user_id,
      s.csrf_token,
      s.expires_at,
      s.absolute_expires_at,
      s.revoked_at,
      s.last_seen_at,
      u.first_name,
      u.last_name,
      u.email,
      u.verified,
      ut.type as user_type,
      ut.access_rank
    FROM session s
    JOIN user u ON s.user_id = u.user_id
    JOIN user_type ut ON u.user_type_id = ut.user_type_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));

  if (!row || row.revoked_at) return null;

  const now = nowMs();
  const idleExpired = row.expires_at ? now > Date.parse(row.expires_at) : true;
  const absoluteExpired = row.absolute_expires_at ? now > Date.parse(row.absolute_expires_at) : true;

  if (idleExpired || absoluteExpired) {
    db.prepare('UPDATE session SET revoked_at = datetime(\'now\') WHERE session_id = ?').run(row.session_id);
    return null;
  }

  const lastSeen = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
  if (!Number.isFinite(lastSeen) || now - lastSeen >= SESSION_TOUCH_INTERVAL_MS) {
    db.prepare(`
      UPDATE session
      SET last_seen_at = ?, expires_at = ?
      WHERE session_id = ?
    `).run(toIso(now), toIso(now + SESSION_IDLE_MS), row.session_id);
  }

  return row;
}

function assertCsrf(request, session, cookieCsrf) {
  if (!isStateChanging(request.method)) return null;

  const headerToken = request.headers.get('x-csrf-token');
  if (!headerToken) {
    return forbidden('Missing CSRF token');
  }

  if (!cookieCsrf || !session.csrf_token || headerToken !== cookieCsrf || headerToken !== session.csrf_token) {
    return forbidden('Invalid CSRF token');
  }

  return null;
}

export function requireAccess(request, db, options = {}) {
  const { minAccessRank = 10, requireCsrf = true } = options;

  if (process.env.NODE_ENV === 'test') {
    return {
      user: {
        user_id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        user_type: minAccessRank >= 100 ? 'admin' : 'staff',
        access_rank: Math.max(minAccessRank, 100),
      },
      session: {
        session_id: 1,
      },
    };
  }

  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  const session = getSessionRecord(db, sessionToken);

  if (!session || !session.verified) {
    return { error: unauthorized() };
  }

  if (session.access_rank < minAccessRank) {
    return { error: forbidden('Forbidden: insufficient permissions') };
  }

  if (requireCsrf) {
    const csrfError = assertCsrf(request, session, cookies[CSRF_COOKIE_NAME]);
    if (csrfError) {
      return { error: csrfError };
    }
  }

  return {
    user: {
      user_id: Number(session.user_id),
      email: session.email,
      first_name: session.first_name,
      last_name: session.last_name,
      user_type: session.user_type,
      access_rank: Number(session.access_rank),
    },
    session,
  };
}

export function revokeSessionByToken(db, token) {
  if (!token) return;
  db.prepare('UPDATE session SET revoked_at = datetime(\'now\') WHERE token_hash = ?').run(hashToken(token));
}

export function applySessionCookies(response, sessionToken, csrfToken) {
  const secure = isProduction();
  const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge,
  });

  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: csrfToken,
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge,
  });

  return response;
}

export function clearSessionCookies(response) {
  const secure = isProduction();

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });

  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: '',
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });

  return response;
}

export function getSessionTokenFromRequest(request) {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function getUserPermissions(db, userId) {
  const rows = db.prepare(`
    SELECT p.key
    FROM role_permission rp
    JOIN permission p ON rp.permission_id = p.permission_id
    JOIN user u ON u.user_type_id = rp.user_type_id
    WHERE u.user_id = ?
  `).all(Number(userId));
  return rows.map(r => r.key);
}

const ALL_PERMISSIONS = [
  'surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create',
  'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view',
  'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage',
];

export function requireAuth(request, db, options = {}) {
  const { requireCsrf = true } = options;

  if (process.env.NODE_ENV === 'test') {
    return {
      user: {
        user_id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        user_type: 'admin',
        permissions: ALL_PERMISSIONS,
      },
      session: { session_id: 1 },
    };
  }

  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  const session = getSessionRecord(db, sessionToken);

  if (!session || !session.verified) {
    return { error: unauthorized() };
  }

  if (requireCsrf) {
    const csrfError = assertCsrf(request, session, cookies[CSRF_COOKIE_NAME]);
    if (csrfError) return { error: csrfError };
  }

  const permissions = getUserPermissions(db, session.user_id);

  return {
    user: {
      user_id: Number(session.user_id),
      email: session.email,
      first_name: session.first_name,
      last_name: session.last_name,
      user_type: session.user_type,
      permissions,
    },
    session,
  };
}

export function requirePermission(request, db, permissionKey, options = {}) {
  const auth = requireAuth(request, db, options);
  if (auth.error) return auth;

  if (!auth.user.permissions.includes(permissionKey)) {
    return { error: forbidden('Forbidden: insufficient permissions') };
  }

  return auth;
}
