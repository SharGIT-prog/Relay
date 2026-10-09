import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../db/mysql');

const MANIFEST = [
  { file: 'create_facility.sql', tolerate: true },
  { file: 'create_patient.sql', tolerate: true },
  { file: 'create_doctor.sql', tolerate: true },
  { file: 'create_admission.sql', tolerate: true },
  { file: 'create_admission_doctor.sql', tolerate: true },
  { file: 'create_app_user.sql', tolerate: true },
  { file: 'create_role.sql', tolerate: true },
  { file: 'create_user_role.sql', tolerate: true },
  { file: 'create_api_client.sql', tolerate: true },
  { file: 'create_sp_admission.sql', tolerate: true },
  { file: 'create_discharge_plan.sql' },
  { file: 'create_resource.sql' },
  { file: 'create_recovery_episode.sql' },
  { file: 'create_transition_requirement.sql' },
  { file: 'create_resource_allocation.sql' },
  { file: 'create_care_handoff.sql' },
  { file: 'create_care_document.sql' },
  { file: 'create_audit_log.sql' },
  { file: 'create_sp_allocate_resource.sql' },
  { file: 'create_v_transition_readiness.sql' },
  { file: 'create_trg_allocation_requirement.sql' },
  { file: 'create_api_client_facility.sql' },
  { file: 'create_v_patient_admission_summary.sql', tolerate: true },
];


const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Did you create .env?`);
  process.exit(1);
}
const dbName = process.env.MYSQL_DATABASE;
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error('MYSQL_DATABASE may only contain letters, digits and underscores.');
  process.exit(1);
}
const applyStubs = (process.env.MYSQL_APPLY_STUBS ?? 'true').toLowerCase() === 'true';

const base = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
};

async function main() {
  const admin = await mysql.createConnection(base);
  const [[{ v }]] = await admin.query('SELECT VERSION() AS v');
  console.log(`MySQL server version : ${v}`);
  const [major, minor, patch] = v.split('-')[0].split('.').map(Number);
  const ok = major > 8 || (major === 8 && (minor > 0 || patch >= 16));
  if (!ok) throw new Error('MySQL 8.0.16+ is required (CHECK constraints are enforced from that version).');
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(dbName)} CHARACTER SET utf8mb4`
  );
  await admin.end();

  const conn = await mysql.createConnection({ ...base, database: dbName, multipleStatements: true });
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
  const [rows] = await conn.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

for (const { file, stub, tolerate } of MANIFEST) {
    if (stub && !applyStubs) {
      console.log(`skip     ${file} (MYSQL_APPLY_STUBS=false)`);
      continue;
    }
    if (applied.has(file)) {
      console.log(`skip     ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      console.log(`applied  ${file}`);
    } catch (err) {
            if (tolerate && [1050, 1304, 1359, 1061].includes(err.errno)) {
        await conn.query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [file]);
        console.log(`present  ${file} (objects already exist; recorded)`);
        continue;
      }
      
      console.error(`FAILED   ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});