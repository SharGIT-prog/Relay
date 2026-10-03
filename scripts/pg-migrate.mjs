import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../db/postgres');

const MIGRATION_ORDER = [
  'enable_pgvector.sql',
  'create_care_document_chunk.sql',
  'create_vector_indexes.sql',
  'create_embedding_model_info.sql',
];

const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Did you create .env?`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
  );

  const files = MIGRATION_ORDER.filter((file) =>
    fs.existsSync(path.join(migrationsDir, file))
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip     ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`FAILED   ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());