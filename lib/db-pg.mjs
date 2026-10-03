// Shared PostgreSQL connection pool
import 'dotenv/config';
import pg from 'pg';

let pool;

export function getPgPool() {
  if (!pool) {
    const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    pool = new pg.Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 5,
    });
  }
  return pool;
}

export async function closePg() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}