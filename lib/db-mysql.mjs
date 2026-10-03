// Shared MySQL connection pool
import 'dotenv/config';
import mysql from 'mysql2/promise';

const g = globalThis;

export function getMysqlPool() {
  if (!g.__cocMysqlPool) {
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    g.__cocMysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true,
    });
  }
  return g.__cocMysqlPool;
}

export async function closeMysql() {
  if (g.__cocMysqlPool) {
    await g.__cocMysqlPool.end();
    g.__cocMysqlPool = undefined;
  }
}

/** Runs fn(connection) inside one transaction: commit on success, rollback on any error. */
export async function withTransaction(fn, pool = getMysqlPool()) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}