// Self-service sign-up and admin account management.
import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';
import { hashPassword } from './auth.mjs';

const APP_ROLES = ['ADMIN', 'CARE_COORDINATOR'];

// 5 sign-ups per IP per hour (in memory; resets on restart)
const hits = new Map();
function throttle(ip) {
  const now = Date.now(), e = hits.get(ip);
  if (!e || now - e.first > 3600_000) { hits.set(ip, { count: 1, first: now }); return; }
  if (e.count >= 5) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many sign-ups from this address. Try again later.');
  e.count++;
}

export async function signUp({ name, email, password }, ip) {
  throttle(ip);
  const hash = await hashPassword(password); // slow, so done before the transaction
  return withTransaction(async (conn) => {
    await conn.query("INSERT IGNORE INTO `role` (role_name) VALUES ('ADMIN'), ('CARE_COORDINATOR')");
    // Locking the role rows serialises concurrent sign ups.
    const [roles] = await conn.query("SELECT role_id, role_name FROM `role` WHERE role_name IN ('ADMIN', 'CARE_COORDINATOR') FOR UPDATE");
    const roleId = (n) => roles.find((r) => r.role_name === n).role_id;

    let role = 'CARE_COORDINATOR', status = 'PENDING';
    if (process.env.SIGNUP_BOOTSTRAP_ADMIN === 'true') {
      const [[c]] = await conn.query(
        "SELECT COUNT(*) AS n FROM user_role ur JOIN app_user u ON u.user_id = ur.user_id WHERE ur.role_id = ? AND u.status = 'ACTIVE'", [roleId('ADMIN')]);
      if (c.n === 0) { role = 'ADMIN'; status = 'ACTIVE'; }
    }
    let userId;
    try {
      userId = (await conn.execute('INSERT INTO app_user (name, email, password_hash, status) VALUES (?, ?, ?, ?)', [name, email, hash, status]))[0].insertId;
    } catch (e) {
      if (e.errno === 1062) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      throw e;
    }
    await conn.execute('INSERT INTO user_role (user_id, role_id) VALUES (?, ?)', [userId, roleId(role)]);
    await writeAudit(conn, { userId, action: 'SIGNUP', entityType: 'APP_USER', entityId: userId, details: { role, status, ip } });
    return {
      status, role,
      message: status === 'ACTIVE' ? 'Account created. You can sign in now.' : 'Account created. An administrator must approve it before you can sign in.',
    };
  });
}

const SELECT_USERS = `SELECT u.user_id, u.name, u.email, u.status, GROUP_CONCAT(r.role_name ORDER BY r.role_name) AS roles
  FROM app_user u LEFT JOIN user_role ur ON ur.user_id = u.user_id LEFT JOIN \`role\` r ON r.role_id = ur.role_id`;
const shape = (rows) => rows.map((r) => ({ ...r, roles: r.roles ? r.roles.split(',') : [] }));

export async function listUsers({ status }, db = getMysqlPool()) {
  const [rows] = await db.query(
    `${SELECT_USERS} ${status ? 'WHERE u.status = ?' : ''}
     GROUP BY u.user_id, u.name, u.email, u.status
     ORDER BY FIELD(u.status, 'PENDING', 'ACTIVE', 'INACTIVE'), u.user_id DESC LIMIT 500`, status ? [status] : []);
  return shape(rows);
}

export async function getUser(id, db = getMysqlPool()) {
  const [rows] = await db.query(`${SELECT_USERS} WHERE u.user_id = ? GROUP BY u.user_id, u.name, u.email, u.status`, [id]);
  if (!rows.length) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  return shape(rows)[0];
}

export async function updateUser(id, changes, actor) {
  if (id === actor.userId) throw new ApiError(409, 'SELF_CHANGE', 'You cannot change your own account');
  await withTransaction(async (conn) => {
    const [u] = await conn.execute('SELECT status FROM app_user WHERE user_id = ? FOR UPDATE', [id]);
    if (!u.length) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    if (changes.role) {
      await conn.query('DELETE ur FROM user_role ur JOIN `role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? AND r.role_name IN (?)', [id, APP_ROLES]);
      await conn.execute('INSERT INTO user_role (user_id, role_id) SELECT ?, role_id FROM `role` WHERE role_name = ?', [id, changes.role]);
    }
    if (changes.status) await conn.execute('UPDATE app_user SET status = ? WHERE user_id = ?', [changes.status, id]);
    const [[r]] = await conn.query(
      'SELECT COUNT(*) AS n FROM user_role ur JOIN `role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? AND r.role_name IN (?)', [id, APP_ROLES]);
    if (changes.status === 'ACTIVE' && r.n === 0) throw new ApiError(422, 'NO_ROLE', 'The account has no role; choose one first');
    await writeAudit(conn, { userId: actor.userId, action: 'USER_UPDATED', entityType: 'APP_USER', entityId: id, details: { before: u[0].status, ...changes } });
  });
  return getUser(id);
}