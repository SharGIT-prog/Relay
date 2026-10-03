// Dev seeder: roles ADMIN and CARE_COORDINATOR, plus two login users (password: password123).
// Safe to re-run: it resets these users' password hash, status and role.
import { getMysqlPool, closeMysql } from '../lib/db-mysql.mjs';
import { hashPassword } from '../lib/auth.mjs';

const USERS = [
  { name: 'Demo Admin', email: 'admin@example.test', role: 'ADMIN' },
  { name: 'Demo Coordinator', email: 'demo.coordinator@example.test', role: 'CARE_COORDINATOR' },
];
const PASSWORD = 'password123'; // local development only

const pool = getMysqlPool();
try {
  await pool.query("INSERT IGNORE INTO `role` (role_name) VALUES ('ADMIN'), ('CARE_COORDINATOR')");
  const hash = await hashPassword(PASSWORD);
  for (const u of USERS) {
    const [rows] = await pool.execute('SELECT user_id FROM app_user WHERE email = ?', [u.email]);
    let userId;
    if (rows.length) {
      userId = rows[0].user_id;
      await pool.execute("UPDATE app_user SET name = ?, password_hash = ?, status = 'ACTIVE' WHERE user_id = ?", [u.name, hash, userId]);
    } else {
      userId = (await pool.execute(
        "INSERT INTO app_user (name, email, password_hash, status) VALUES (?, ?, ?, 'ACTIVE')", [u.name, u.email, hash]))[0].insertId;
    }
    await pool.execute(
      'INSERT IGNORE INTO user_role (user_id, role_id) SELECT ?, role_id FROM `role` WHERE role_name = ?', [userId, u.role]);
    console.log(`user ${userId}  ${u.email}  (${u.role})`);
  }
  console.log(`\nPassword for both: ${PASSWORD}`);
} finally {
  await closeMysql();
}