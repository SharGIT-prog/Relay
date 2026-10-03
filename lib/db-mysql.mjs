// Shared MySQL connection pool
import 'dotenv/config';
import mysql from 'mysql2/promise';

let pool;

export function getMysqlPool() {
  if (!pool) {
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      dateStrings: true, 
    });
  }
  return pool;
}

export async function closeMysql() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}