import crypto from 'node:crypto';
import { getMysqlPool } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

const TOKEN_RE = /^coc_(\d{1,15})_([A-Za-z0-9_-]{43})$/;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

export function newCredential() {
  const secret = crypto.randomBytes(32).toString('base64url');
  return { secret, hash: sha256(secret).toString('hex') };
}
export const buildToken = (clientId, secret) => `coc_${clientId}_${secret}`;

// ---- throttling: 10 failures per client+IP per 15 minutes ----
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map();
function assertNotThrottled(key) {
  const e = fails.get(key);
  if (e && Date.now() - e.first > WINDOW_MS) fails.delete(key);
  else if (e && e.count >= MAX_FAILS) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.');
}
function recordFail(key) {
  const e = fails.get(key);
  if (e) e.count++; else fails.set(key, { count: 1, first: Date.now() });
}

const DUMMY = Buffer.alloc(32);

/** Authenticates request, returns { clientId, name, type, facilityIds }. */
export async function requireClient(request, db = getMysqlPool()) {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i);
  const t = m && TOKEN_RE.exec(m[1]);
  if (!t) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid API credential is required');
  const clientId = Number(t[1]);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `${clientId}|${ip}`;
  assertNotThrottled(key);

  const [rows] = await db.execute(
    'SELECT client_id, client_name, client_type, credential_hash, status FROM api_client WHERE client_id = ?', [clientId]);
  const row = rows[0];
  const stored = row ? Buffer.from(row.credential_hash, 'hex') : DUMMY;
  const given = sha256(t[2]);
  const secretOk = stored.length === given.length && crypto.timingSafeEqual(given, stored);

  if (!row || !secretOk || row.status !== 'ACTIVE') {
    recordFail(key);
    if (row) {
      await writeAudit(db, { userId: null, clientId, action: 'API_AUTH_FAILED', entityType: 'API_CLIENT', entityId: clientId, details: { ip } })
        .catch((e) => console.error('AUDIT FAILURE (api auth):', e));
    }
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid API credential is required');
  }
  fails.delete(key);

  const [fac] = await db.execute('SELECT facility_id FROM api_client_facility WHERE client_id = ? ORDER BY facility_id', [clientId]);
  if (!fac.length) throw new ApiError(403, 'NO_FACILITY_SCOPE', 'This API client is not linked to any facility');
  return { clientId, name: row.client_name, type: row.client_type, facilityIds: fac.map((f) => f.facility_id) };
}

export async function auditApi(client, { action, entityType, entityId, details = null }, db = getMysqlPool()) {
  const cid = typeof client === 'object' ? (client.clientId ?? client.id) : client;
  await writeAudit(db, {
    userId: null,
    clientId: cid,
    action,
    entityType,
    entityId: entityId ?? '0',
    details,
  });
}