// Shared PostgreSQL connection pool
import 'dotenv/config';
import pg from 'pg';

const g = globalThis;

export function getPgPool() {
  if (!g.__cocPgPool) {
    const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    g.__cocPgPool = new pg.Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 5,
    });
  }
  return g.__cocPgPool;
}

export async function closePg() {
  if (g.__cocPgPool) {
    await g.__cocPgPool.end();
    g.__cocPgPool = undefined;
  }
}