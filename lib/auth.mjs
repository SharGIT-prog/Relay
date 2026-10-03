import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getMysqlPool } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export const SESSION_COOKIE = 'coc_session';
export const SESSION_HOURS = 8;
export const APP_ROLES = ['ADMIN', 'CARE_COORDINATOR'];
const BCRYPT_COST = 10;

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  if (process.env.NODE_ENV === 'production' && s.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return new TextEncoder().encode(s);
}

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);

let dummy;
const dummyHash = () => (dummy ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

export async function createSessionToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: SESSION_HOURS * 3600,
  });
}
export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0,
  });
}

/** Loads an ACTIVE user with roles, or null. */
export async function loadUser(userId, db = getMysqlPool()) {
  const [users] = await db.execute('SELECT user_id, name, email, status FROM app_user WHERE user_id = ?', [userId]);
  if (!users.length || users[0].status !== 'ACTIVE') return null;
  const [roles] = await db.execute(
    'SELECT r.role_name FROM user_role ur JOIN `role` r ON r.role_id = ur.role_id WHERE ur.user_id = ?', [userId]);
  return { userId: users[0].user_id, name: users[0].name, email: users[0].email, roles: roles.map((r) => r.role_name) };
}

function assertSameOriginJson(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const ct = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.startsWith('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  const origin = request.headers.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== request.headers.get('host')) throw new ApiError(403, 'CSRF_REJECTED', 'Cross-origin request rejected');
  }
}

/** Authenticates request, checks the role, returns { userId, name, email, roles }. */
export async function requireAuth(request, { roles = APP_ROLES } = {}) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;
  const user = userId ? await loadUser(userId) : null;
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  assertSameOriginJson(request);
  if (roles && !user.roles.some((r) => roles.includes(r))) {
    throw new ApiError(403, 'FORBIDDEN', 'Your role is not permitted to perform this action');
  }
  return user;
}

// ---- login throttling: 5 failures per email+IP per 15 minutes (in memory; resets on restart) ----
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map();

function assertNotThrottled(key) {
  const e = fails.get(key);
  if (e && Date.now() - e.first > WINDOW_MS) fails.delete(key);
  else if (e && e.count >= MAX_FAILS) {
    throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again later.');
  }
}
function recordFail(key) {
  const e = fails.get(key);
  if (e) e.count++;
  else fails.set(key, { count: 1, first: Date.now() });
}

export async function loginUser({ email, password, ip }, db = getMysqlPool()) {
  const key = `${email.toLowerCase()}|${ip}`;
  assertNotThrottled(key);

  const [rows] = await db.execute(
    'SELECT user_id, password_hash, status FROM app_user WHERE email = ?', [email]);
  const row = rows[0];
  // Always run 1 bcrypt comparison so unknown emails take as long as wrong passwords.
  const passwordOk = await bcrypt.compare(password, row ? row.password_hash : dummyHash());

  if (!row || !passwordOk || row.status !== 'ACTIVE') {
    recordFail(key);
    if (row) {
      await writeAudit(db, { userId: row.user_id, action: 'LOGIN_FAILED', entityType: 'APP_USER', entityId: row.user_id, details: { ip } });
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const user = await loadUser(row.user_id, db);
  if (!user.roles.some((r) => APP_ROLES.includes(r))) {
    throw new ApiError(403, 'NO_ROLE', 'This account has no role permitted to use the system');
  }
  fails.delete(key);
  await writeAudit(db, { userId: user.userId, action: 'LOGIN', entityType: 'APP_USER', entityId: user.userId, details: { ip } });
  return user;
}