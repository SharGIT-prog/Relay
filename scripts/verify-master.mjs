// Master end-to-end verification. Black-box: databases, HTTP, pages and CLI only. Imports nothing from lib/.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import pg from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ROOT = process.cwd();
const DOCDIR = path.join(ROOT, 'data', 'documents');
const tag = Date.now();

let nPass = 0, nFail = 0; const failed = [];
const ok = (label, cond, extra = '') => {
  const good = Boolean(cond);
  if (good) nPass++; else { nFail++; failed.push(label); }
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`);
  return good;
};
const section = (t) => console.log(`\n=== ${t} ===`);
const guarded = async (name, fn) => {
  try { await fn(); } catch (e) { nFail++; failed.push(`${name} crashed`); console.log(`FAIL  [${name}] crashed: ${(e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')}`); }
};

const cfg = { host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, dateStrings: true };
const my = mysql.createPool({ ...cfg, connectionLimit: 8 });
const multi = await mysql.createConnection({ ...cfg, multipleStatements: true });
const pgp = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE, max: 4 });
const q = async (sql, p = []) => (await my.query(sql, p))[0];
const ins = async (sql, p = []) => (await my.query(sql, p))[0].insertId;
const errOf = async (sql, p = []) => { try { await my.query(sql, p); return 0; } catch (e) { return e.errno ?? -1; } };
const pgErr = async (sql, p = []) => {
  const c = await pgp.connect();
  try { await c.query('BEGIN'); await c.query(sql, p); return 0; } catch (e) { return e.code ?? -1; }
  finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
};

// ------------------------------------------------------------------ cleanup (also runs first)
const createdRoles = [];
async function cleanup() {
  const del = async (sql, p = []) => { try { await my.query(sql, p); } catch (e) { console.log('cleanup warning:', e.message); } };
  const P = "(SELECT patient_id FROM patient WHERE name LIKE 'ZZMT %')";
  const A = `(SELECT admission_id FROM admission WHERE patient_id IN ${P})`;
  const U = "(SELECT user_id FROM app_user WHERE email LIKE 'zzmt-%')";
  const C = "(SELECT client_id FROM api_client WHERE client_name LIKE 'ZZMT %')";
  const docIds = (await q(`SELECT document_id FROM care_document WHERE patient_id IN ${P}`)).map((r) => Number(r.document_id));
  if (docIds.length) await pgp.query('DELETE FROM care_document_chunk WHERE document_id = ANY($1::bigint[])', [docIds]).catch(() => {});
  await pgp.query('DELETE FROM care_document_chunk WHERE document_id BETWEEN 920000000 AND 920000100').catch(() => {});
  for (const d of docIds) fs.rmSync(path.join(DOCDIR, `${d}.txt`), { force: true });
  await del(`DELETE FROM audit_log WHERE user_id IN ${U} OR client_id IN ${C}`);
  await del(`DELETE FROM care_document WHERE patient_id IN ${P}`);
  await del(`DELETE FROM care_handoff WHERE admission_id IN ${A}`);
  await del(`DELETE FROM resource_allocation WHERE admission_id IN ${A}`);
  await del(`DELETE FROM transition_requirement WHERE discharge_id IN (SELECT discharge_id FROM discharge_plan WHERE admission_id IN ${A})`);
  await del(`DELETE FROM discharge_plan WHERE admission_id IN ${A}`);
  await del(`DELETE FROM recovery_episode WHERE patient_id IN ${P}`);
  await del(`DELETE FROM admission_doctor WHERE admission_id IN ${A}`);
  await del(`DELETE FROM admission WHERE patient_id IN ${P}`);
  await del("DELETE FROM resource WHERE resource_type LIKE 'ZZMT%'");
  await del("DELETE FROM patient WHERE name LIKE 'ZZMT %'");
  await del("DELETE FROM doctor WHERE name LIKE 'ZZMT %'");
  await del(`DELETE FROM api_client_facility WHERE client_id IN ${C}`);
  await del("DELETE FROM api_client WHERE client_name LIKE 'ZZMT %'");
  await del(`DELETE FROM user_role WHERE user_id IN ${U}`);
  await del("DELETE FROM app_user WHERE email LIKE 'zzmt-%'");
  await del("DELETE FROM facility WHERE name LIKE 'ZZMT %'");
  for (const r of createdRoles) await del('DELETE FROM `role` WHERE role_id = ?', [r]);
}

// ------------------------------------------------------------------ HTTP helpers
let S = ''; // coordinator session cookie
async function call(method, p, { body, anon, cookie, headers } = {}) {
  const c = anon ? '' : (cookie ?? S);
  const res = await fetch(BASE + p, { method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(c ? { cookie: c } : {}), ...(headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, code: data?.error?.code, msg: data?.error?.message, res };
}
const is = (r, s, c) => r.status === s && (c === undefined || r.code === c);
async function ext(method, p, token, headers = {}) {
  const res = await fetch(BASE + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, code: data?.error?.code, msg: data?.error?.message };
}
async function login(email, pw = 'password123') {
  const res = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
  let data = null; try { data = await res.json(); } catch {}
  const set = res.headers.getSetCookie();
  return { status: res.status, data, code: data?.error?.code, msg: data?.error?.message, raw: set.join(' '),
    cookie: (set.find((c) => c.startsWith('coc_session=')) ?? '').split(';')[0] };
}
const mkClient = (name, ...facs) => {
  try {
    const out = execFileSync('node', ['scripts/create-api-client.mjs', '--name', `ZZMT ${name}`, ...facs.flatMap((f) => ['--facility', String(f)])], { cwd: ROOT, encoding: 'utf8' });
    const token = out.match(/(coc_\d+_[A-Za-z0-9_-]{43})/)?.[1];
    return token ? { token, id: Number(token.split('_')[1]) } : null;
  } catch { return null; }
};

// ------------------------------------------------------------------ fixtures
const F = {}, X = {};
const hash = await bcrypt.hash('password123', 4);
async function role(name) {
  const r = await q('SELECT role_id FROM `role` WHERE role_name = ?', [name]);
  if (r.length) return r[0].role_id;
  const id = await ins('INSERT INTO `role` (role_name) VALUES (?)', [name]); createdRoles.push(id); return id;
}
async function mkUser(name, status, roles) {
  const email = `zzmt-${name}-${tag}@example.test`;
  const id = await ins('INSERT INTO app_user (name,email,password_hash,status) VALUES (?,?,?,?)', [`ZZMT ${name}`, email, hash, status]);
  for (const r of roles) await q('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', [id, await role(r)]);
  return { id, email };
}

console.log('Cleaning leftovers from earlier runs, then building test data...');
await cleanup();
try {
  F.coord = await mkUser('coord', 'ACTIVE', ['CARE_COORDINATOR']);
  F.admin = await mkUser('admin', 'ACTIVE', ['ADMIN']);
  F.inactive = await mkUser('inactive', 'INACTIVE', ['CARE_COORDINATOR']);
  F.norole = await mkUser('norole', 'ACTIVE', []);
  F.deact = await mkUser('deact', 'ACTIVE', ['CARE_COORDINATOR']);
  F.demote = await mkUser('demote', 'ACTIVE', ['CARE_COORDINATOR']);
  F.thr = await mkUser('thr', 'ACTIVE', ['CARE_COORDINATOR']);
  const fac = (n, t = 'HOSPITAL') => ins("INSERT INTO facility (name,facility_type,address,contact_number) VALUES (?,?, 'a','1')", [`ZZMT F${n}`, t]);
  F.f1 = await fac(1); F.f2 = await fac(2, 'REHAB'); F.f3 = await fac(3);
  const pat = (n, dob) => ins('INSERT INTO patient (name, DOB) VALUES (?,?)', [`ZZMT ${n}`, dob]);
  F.p1 = await pat('Zebra Patient', '1950-03-14'); F.p2 = await pat('Second Patient', '1960-01-01'); F.p3 = await pat('Sql Patient', '1970-01-01');
  const doc = (n) => ins("INSERT INTO doctor (name,specialisation,contact_number) VALUES (?, 'GEN','1')", [`ZZMT Dr ${n}`]);
  F.dA = await doc('A'); F.dB = await doc('B');
  const adm = (p) => ins("INSERT INTO admission (patient_id,facility_id,admission_date) VALUES (?,?, '2031-01-01 08:00:00')", [p, F.f1]);
  F.a1 = await adm(F.p1); F.a2 = await adm(F.p1); F.a3 = await adm(F.p2); F.a4 = await adm(F.p2);
  F.aS = await adm(F.p3); F.aT = await adm(F.p3); F.aV = await adm(F.p3);
  for (const a of [F.a1, F.a2, F.a3, F.a4]) await q('INSERT INTO admission_doctor (admission_id, doctor_id) VALUES (?,?)', [a, F.dA]);
  const res = (t, av, f = F.f1) => ins('INSERT INTO resource (resource_type,availability,facility_id) VALUES (?,?,?)', [t, av, f]);
  F.ab1 = await res('ZZMT_BED', 'AVAILABLE'); F.ab2 = await res('ZZMT_BED', 'MAINTENANCE'); F.ach = await res('ZZMT_CHAIR', 'AVAILABLE', F.f2);
  F.rb1 = await res('ZZMT_SQLBED', 'AVAILABLE'); F.rb2 = await res('ZZMT_SQLBED', 'MAINTENANCE'); F.rb3 = await res('ZZMT_SQLBED', 'AVAILABLE');
  F.rb4 = await res('ZZMT_SQLBED', 'AVAILABLE'); F.rc = await res('ZZMT_SQLCHAIR', 'AVAILABLE'); F.rcon = await res('ZZMT_SQLBED', 'AVAILABLE');
  F.rS = await ins("INSERT INTO recovery_episode (patient_id,facility_id,start_date,status) VALUES (?,?, '2031-02-01','ACTIVE')", [F.p3, F.f2]);
  const plan = (a, dest) => ins("INSERT INTO discharge_plan (admission_id,doctor_id,discharge_date,status,destination_facility_id) VALUES (?,?, '2031-02-05 10:00:00','PLANNED',?)", [a, F.dA, dest]);
  F.dS = await plan(F.aS, F.f2); F.dV = await plan(F.aV, F.f2); F.dV2 = await plan(F.aV, null);
  const req = (d, t, s) => ins('INSERT INTO transition_requirement (discharge_id,recovery_id,resource_type,status) VALUES (?,?,?,?)', [d, F.rS, t, s]);
  F.tA = await req(F.dS, 'ZZMT_SQLBED', 'PENDING'); F.tChair = await req(F.dS, 'ZZMT_SQLCHAIR', 'PENDING');
  F.tCan = await req(F.dS, 'ZZMT_SQLBED', 'CANCELLED'); F.tB = await req(F.dS, 'ZZMT_SQLBED', 'PENDING');
} catch (e) { console.error('FIXTURE SETUP FAILED:', e.message); await cleanup(); process.exit(2); }

// =================================================================== 1. ENVIRONMENT
await guarded('env', async () => {
  section('1. Environment');
  let h; try { h = await call('GET', '/api/health', { anon: true }); } catch { console.error(`Cannot reach ${BASE}. Start npm run dev in Terminal C.`); await cleanup(); process.exit(2); }
  ok('health endpoint: MySQL and PostgreSQL both ok', h.status === 200 && h.data.mysql === 'ok' && h.data.postgres === 'ok');
  const [[{ v }]] = await my.query('SELECT VERSION() AS v');
  const [mj, mn, pt] = v.split('-')[0].split('.').map(Number);
  ok(`MySQL >= 8.0.16 (CHECK constraints enforced) [${v}]`, mj > 8 || (mj === 8 && (mn > 0 || pt >= 16)));
  const ext_ = await pgp.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
  const [em, en] = (ext_.rows[0]?.extversion ?? '0.0').split('.').map(Number);
  ok(`pgvector installed, >= 0.8 (iterative scan) [${ext_.rows[0]?.extversion}]`, em > 0 || en >= 8);
  const sv = await pgp.query('SHOW server_version'); ok(`PostgreSQL reachable [${sv.rows[0].server_version}]`, true);
});

// =================================================================== 2. MYSQL SCHEMA
await guarded('mysql-schema', async () => {
  section('2. MySQL schema against the specification');
  const want = ['patient', 'doctor', 'facility', 'admission', 'admission_doctor', 'discharge_plan', 'resource', 'resource_allocation',
    'transition_requirement', 'recovery_episode', 'care_handoff', 'care_document', 'app_user', 'role', 'user_role', 'api_client', 'audit_log'];
  const tables = await q('SELECT TABLE_NAME AS t, ENGINE AS e FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const have = new Map(tables.map((t) => [t.t.toLowerCase(), t.e]));
  ok('all 17 specified tables exist', want.every((t) => have.has(t)), want.filter((t) => !have.has(t)).join(','));
  ok('all 17 use InnoDB', want.every((t) => have.get(t) === 'InnoDB'));
  ok('api_client_facility (client scope) exists', have.has('api_client_facility'));

  const SPEC = {
    discharge_plan: 'discharge_id:bigint:N admission_id:bigint:N doctor_id:bigint:N discharge_date:datetime:N status:varchar:N destination_facility_id:bigint:Y notes:text:Y',
    resource: 'resource_id:bigint:N resource_type:varchar:N availability:varchar:N facility_id:bigint:N',
    recovery_episode: 'recovery_id:bigint:N patient_id:bigint:N facility_id:bigint:N start_date:date:N end_date:date:Y status:varchar:N',
    transition_requirement: 'requirement_id:bigint:N discharge_id:bigint:N recovery_id:bigint:N resource_type:varchar:N required_form:varchar:Y required_until:datetime:Y status:varchar:N',
    resource_allocation: 'allocation_id:bigint:N admission_id:bigint:N resource_id:bigint:N resource_type:varchar:N start_time:datetime:N end_time:datetime:N requirement_id:bigint:Y allocation_status:varchar:N allocated_by:bigint:N',
    care_handoff: 'handoff_id:bigint:N admission_id:bigint:N discharge_id:bigint:N from_facility_id:bigint:N to_facility_id:bigint:N status:varchar:N handoff_date:datetime:N acknowledged_at:datetime:Y created_by:bigint:N',
    care_document: 'document_id:bigint:N patient_id:bigint:N admission_id:bigint:Y recovery_id:bigint:Y document_type:varchar:N title:varchar:N source:varchar:N created_by:bigint:N created_at:datetime:N status:varchar:N',
    audit_log: 'audit_id:bigint:N user_id:bigint:Y client_id:bigint:Y action:varchar:N entity_type:varchar:N entity_id:varchar:N timestamp:datetime:N details:json:Y',
  };
  for (const [t, spec] of Object.entries(SPEC)) {
    const cols = await q('SELECT COLUMN_NAME AS c, DATA_TYPE AS d, IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t]);
    const got = new Map(cols.map((c) => [c.c.toLowerCase(), `${c.d}:${c.n === 'YES' ? 'Y' : 'N'}`]));
    const bad = spec.split(' ').filter((s) => { const [n, d, y] = s.split(':'); return got.get(n) !== `${d}:${y}`; });
    ok(`${t}: columns, types and nullability match the spec`, bad.length === 0, bad.join(','));
  }
  const FK = { discharge_plan: 'admission_id>admission doctor_id>doctor destination_facility_id>facility', resource: 'facility_id>facility',
    recovery_episode: 'patient_id>patient facility_id>facility', transition_requirement: 'discharge_id>discharge_plan recovery_id>recovery_episode',
    resource_allocation: 'admission_id>admission resource_id>resource requirement_id>transition_requirement allocated_by>app_user',
    care_handoff: 'admission_id>admission discharge_id>discharge_plan from_facility_id>facility to_facility_id>facility created_by>app_user',
    care_document: 'patient_id>patient admission_id>admission recovery_id>recovery_episode created_by>app_user', audit_log: 'user_id>app_user client_id>api_client' };
  for (const [t, spec] of Object.entries(FK)) {
    const r = await q('SELECT COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS r FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL', [t]);
    const got = r.map((x) => `${x.c}>${x.r}`.toLowerCase());
    ok(`${t}: foreign keys ${spec.split(' ').length}/${spec.split(' ').length} present`, spec.split(' ').every((s) => got.includes(s)), spec.split(' ').filter((s) => !got.includes(s)).join(','));
  }
  const lead = async (t) => (await q('SELECT COLUMN_NAME AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND SEQ_IN_INDEX = 1', [t])).map((x) => x.c.toLowerCase());
  const IDX = { discharge_plan: ['admission_id', 'doctor_id', 'destination_facility_id'], resource: ['resource_type', 'availability', 'facility_id'],
    recovery_episode: ['patient_id', 'facility_id', 'status'], resource_allocation: ['resource_id', 'admission_id', 'requirement_id'],
    care_handoff: ['discharge_id', 'to_facility_id', 'status'], audit_log: ['timestamp', 'entity_type'] };
  for (const [t, cols] of Object.entries(IDX)) { const l = await lead(t); ok(`${t}: indexes lead with ${cols.join(', ')}`, cols.every((c) => l.includes(c)), cols.filter((c) => !l.includes(c)).join(',')); }
  const ix = await q('SELECT INDEX_NAME AS i, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME', ['resource_allocation']);
  ok('resource_allocation has composite index (resource_id, start_time, end_time)', ix.some((x) => x.c.toLowerCase() === 'resource_id,start_time,end_time'));
  const ix2 = await q('SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME', ['audit_log']);
  ok('audit_log has index (entity_type, entity_id)', ix2.some((x) => x.c.toLowerCase() === 'entity_type,entity_id'));
  const uq = await q("SELECT COLUMN_NAME AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND NON_UNIQUE = 0");
  ok('app_user.email is unique', uq.some((x) => x.c.toLowerCase() === 'email'));

  console.log('-- constraints actually reject bad data');
  const u = F.coord.id, T = '2031-03-01 10:00:00', T2 = '2031-03-01 12:00:00';
  const E = [
    ['discharge_plan: invalid status (CHECK)', "INSERT INTO discharge_plan (admission_id,doctor_id,discharge_date,status) VALUES (?,?, ?, 'BOGUS')", [F.a1, F.dA, T], 3819],
    ['discharge_plan: unknown admission (FK)', "INSERT INTO discharge_plan (admission_id,doctor_id,discharge_date,status) VALUES (900000000,?, ?, 'PLANNED')", [F.dA, T], 1452],
    ['resource: invalid availability (CHECK)', "INSERT INTO resource (resource_type,availability,facility_id) VALUES ('ZZMT_X','BROKEN',?)", [F.f1], 3819],
    ['resource: unknown facility (FK)', "INSERT INTO resource (resource_type,availability,facility_id) VALUES ('ZZMT_X','AVAILABLE',900000000)", [], 1452],
    ['recovery_episode: invalid status (CHECK)', "INSERT INTO recovery_episode (patient_id,facility_id,start_date,status) VALUES (?,?, '2031-01-01','BOGUS')", [F.p1, F.f1], 3819],
    ['recovery_episode: end_date before start_date (CHECK)', "INSERT INTO recovery_episode (patient_id,facility_id,start_date,end_date,status) VALUES (?,?, '2031-02-01','2031-01-01','PLANNED')", [F.p1, F.f1], 3819],
    ['recovery_episode: unknown patient (FK)', "INSERT INTO recovery_episode (patient_id,facility_id,start_date,status) VALUES (900000000,?, '2031-01-01','PLANNED')", [F.f1], 1452],
    ['transition_requirement: invalid status (CHECK)', "INSERT INTO transition_requirement (discharge_id,recovery_id,resource_type,status) VALUES (?,?, 'ZZMT_X','BOGUS')", [F.dS, F.rS], 3819],
    ['transition_requirement: unknown discharge (FK)', "INSERT INTO transition_requirement (discharge_id,recovery_id,resource_type,status) VALUES (900000000,?, 'ZZMT_X','PENDING')", [F.rS], 1452],
    ['resource_allocation: end_time = start_time (CHECK)', "INSERT INTO resource_allocation (admission_id,resource_id,resource_type,start_time,end_time,allocated_by) VALUES (?,?, 'ZZMT_X',?,?,?)", [F.aS, F.rb4, T, T, u], 3819],
    ['resource_allocation: invalid status (CHECK)', "INSERT INTO resource_allocation (admission_id,resource_id,resource_type,start_time,end_time,allocation_status,allocated_by) VALUES (?,?, 'ZZMT_X',?,?, 'BOGUS',?)", [F.aS, F.rb4, T, T2, u], 3819],
    ['resource_allocation: unknown resource (FK)', "INSERT INTO resource_allocation (admission_id,resource_id,resource_type,start_time,end_time,allocated_by) VALUES (?,900000000, 'ZZMT_X',?,?,?)", [F.aS, T, T2, u], 1452],
    ['care_handoff: from = to facility (CHECK)', "INSERT INTO care_handoff (admission_id,discharge_id,from_facility_id,to_facility_id,status,handoff_date,created_by) VALUES (?,?,?,?, 'SENT',?,?)", [F.aS, F.dS, F.f1, F.f1, T, u], 3819],
    ['care_handoff: ACKNOWLEDGED without timestamp (CHECK)', "INSERT INTO care_handoff (admission_id,discharge_id,from_facility_id,to_facility_id,status,handoff_date,created_by) VALUES (?,?,?,?, 'ACKNOWLEDGED',?,?)", [F.aS, F.dS, F.f1, F.f2, T, u], 3819],
    ['care_handoff: invalid status (CHECK)', "INSERT INTO care_handoff (admission_id,discharge_id,from_facility_id,to_facility_id,status,handoff_date,created_by) VALUES (?,?,?,?, 'BOGUS',?,?)", [F.aS, F.dS, F.f1, F.f2, T, u], 3819],
    ['care_document: invalid status (CHECK)', "INSERT INTO care_document (patient_id,document_type,title,source,created_by,status) VALUES (?, 'X','ZZMT t','s',?, 'BOGUS')", [F.p1, u], 3819],
    ['audit_log: row with no actor (CHECK)', "INSERT INTO audit_log (action,entity_type,entity_id) VALUES ('T','T','1')", [], 3819],
    ['audit_log: malformed JSON details', "INSERT INTO audit_log (user_id,action,entity_type,entity_id,details) VALUES (?, 'T','T','1','not json')", [u], 3140],
    ['app_user: duplicate email (UNIQUE)', "INSERT INTO app_user (name,email,password_hash,status) VALUES ('ZZMT dup',?, 'x','ACTIVE')", [F.coord.email], 1062],
    ['restrict: facility with resources cannot be deleted (FK RESTRICT)', 'DELETE FROM facility WHERE facility_id = ?', [F.f1], 1451],
  ];
  for (const [label, sql, p, no] of E) { const got = await errOf(sql, p); ok(label, got === no, `(errno ${got})`); }
  const defs = await q("SELECT COLUMN_NAME AS c, COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME='discharge_plan' AND COLUMN_NAME='status') OR (TABLE_NAME='resource' AND COLUMN_NAME='availability'))");
  ok('status/availability columns have defaults (PLANNED / AVAILABLE)', defs.length === 2 && defs.every((x) => ['PLANNED', 'AVAILABLE'].includes(String(x.d).replace(/'/g, ''))));
});

// =================================================================== 3. POSTGRES
await guarded('postgres', async () => {
  section('3. PostgreSQL + pgvector');
  const cols = (await pgp.query("SELECT column_name AS c, data_type AS d, is_nullable AS n FROM information_schema.columns WHERE table_name='care_document_chunk'")).rows;
  const g = new Map(cols.map((c) => [c.c, `${c.d}:${c.n}`]));
  ok('care_document_chunk columns and types', g.get('chunk_id') === 'bigint:NO' && g.get('document_id') === 'bigint:NO' && g.get('chunk_index') === 'integer:NO'
    && g.get('content') === 'text:NO' && g.get('metadata') === 'jsonb:YES' && g.get('created_at') === 'timestamp with time zone:NO' && g.get('embedding')?.endsWith(':NO'));
  const ft = (await pgp.query("SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid='care_document_chunk'::regclass AND attname='embedding'")).rows[0]?.t;
  ok('embedding column is vector(384)', ft === 'vector(384)', `(${ft})`);
  const idx = (await pgp.query("SELECT indexdef FROM pg_indexes WHERE tablename='care_document_chunk'")).rows.map((r) => r.indexdef.toLowerCase());
  ok('HNSW index with cosine operator class', idx.some((d) => d.includes('hnsw') && d.includes('vector_cosine_ops')));
  ok('unique index on (document_id, chunk_index)', idx.some((d) => d.includes('unique') && d.includes('document_id') && d.includes('chunk_index')));
  const vec = (i) => `[${Array.from({ length: 384 }, (_, k) => (k === i ? 1 : 0)).join(',')}]`;
  const ins1 = 'INSERT INTO care_document_chunk (document_id, chunk_index, content, embedding, metadata) VALUES ($1,$2,$3,$4::vector,$5::jsonb)';
  ok('blank content rejected (CHECK)', (await pgErr(ins1, [920000001, 0, '   ', vec(0), null])) === '23514');
  ok('negative chunk_index rejected (CHECK)', (await pgErr(ins1, [920000001, -1, 'x', vec(0), null])) === '23514');
  ok('NULL embedding rejected (NOT NULL)', (await pgErr(ins1.replace('$4::vector', 'NULL'), [920000001, 0, 'x', null, null])) === '23502');
  ok('vector of wrong dimension rejected', (await pgErr(ins1, [920000001, 0, 'x', '[1,2,3]', null])) !== 0);
  const c = await pgp.connect();
  try {
    await c.query('BEGIN');
    await c.query(ins1, [920000002, 0, 'chunk A', vec(0), '{"document_type":"ZZMT"}']);
    await c.query(ins1, [920000002, 1, 'chunk B', vec(1), '{"document_type":"ZZMT"}']);
    let dup = null; await c.query('SAVEPOINT s'); try { await c.query(ins1, [920000002, 1, 'dup', vec(2), null]); } catch (e) { dup = e.code; } await c.query('ROLLBACK TO s');
    ok('duplicate (document_id, chunk_index) rejected (UNIQUE)', dup === '23505');
    const r = (await c.query("SELECT content, embedding <=> $1::vector AS d FROM care_document_chunk WHERE metadata @> '{\"document_type\":\"ZZMT\"}' ORDER BY embedding <=> $1::vector", [vec(0)])).rows;
    ok('cosine ordering: identical vector first (distance 0), orthogonal second (distance 1)', r[0]?.content === 'chunk A' && Math.abs(r[0].d) < 1e-6 && Math.abs(r[1].d - 1) < 1e-6);
    await c.query('SET LOCAL hnsw.iterative_scan = relaxed_order'); ok('hnsw.iterative_scan setting is available (pgvector 0.8+)', true);
  } finally { await c.query('ROLLBACK'); c.release(); }
  const mi = (await pgp.query('SELECT * FROM embedding_model_info')).rows;
  ok('embedding_model_info: exactly one row, 384 dimensions, cosine', mi.length === 1 && mi[0].dimension === 384 && mi[0].distance_metric === 'cosine', mi[0] ? `(${mi[0].model_name})` : '(empty: fills on first ingestion)');
  ok('embedding_model_info cannot hold a second row', (await pgErr("INSERT INTO embedding_model_info (singleton,model_name,model_version,dimension,distance_metric) VALUES (false,'x','y',384,'cosine')")) !== 0);
});

// =================================================================== 4. ADVANCED SQL
await guarded('advanced-sql', async () => {
  section('4. Advanced SQL: procedure, transaction, trigger, view, queries');
  const u = F.coord.id, S1 = '2031-01-01 10:00:00', E1 = '2031-01-01 12:00:00', E2 = '2031-01-01 14:00:00';
  const sc = await mysql.createConnection(cfg);
  const sp = async (c, ...a) => { await c.query('CALL sp_allocate_resource(?,?,?,?,?,?,@o)', a); return (await c.query('SELECT @o AS id'))[0][0].id; };
  const spErr = async (...a) => { try { await sp(sc, ...a); return 0; } catch (e) { return e.errno; } };
  const reqSt = async (id) => (await q('SELECT status FROM transition_requirement WHERE requirement_id=?', [id]))[0].status;
  const alSt = async (id) => (await q('SELECT allocation_status AS s FROM resource_allocation WHERE allocation_id=?', [id]))[0].s;

  const al1 = await sp(sc, F.aS, F.rb1, S1, E1, F.tA, u);
  const row = (await q('SELECT resource_type, allocation_status, allocated_by FROM resource_allocation WHERE allocation_id=?', [al1]))[0];
  ok('procedure: valid booking returns an id; type copied from resource; ACTIVE; allocated_by set', al1 > 0 && row.resource_type === 'ZZMT_SQLBED' && row.allocation_status === 'ACTIVE' && row.allocated_by === u);
  ok('procedure: requirement PENDING -> ALLOCATED', (await reqSt(F.tA)) === 'ALLOCATED');
  ok('procedure: overlapping window rejected (50009)', (await spErr(F.aS, F.rb1, '2031-01-01 11:00:00', '2031-01-01 13:00:00', null, u)) === 50009);
  ok('procedure: back-to-back booking accepted', (await sp(sc, F.aS, F.rb1, E1, E2, null, u)) > 0);
  ok('procedure: end <= start rejected (50001)', (await spErr(F.aS, F.rb1, E1, S1, null, u)) === 50001);
  ok('procedure: unknown resource (50002)', (await spErr(F.aS, 900000000, S1, E1, null, u)) === 50002);
  ok('procedure: MAINTENANCE resource (50003)', (await spErr(F.aS, F.rb2, S1, E1, null, u)) === 50003);
  ok('procedure: unknown admission (50004)', (await spErr(900000000, F.rb3, S1, E1, null, u)) === 50004);
  ok('procedure: unknown requirement (50005)', (await spErr(F.aS, F.rb3, S1, E1, 900000000, u)) === 50005);
  ok('procedure: CANCELLED requirement (50006)', (await spErr(F.aS, F.rb3, S1, E1, F.tCan, u)) === 50006);
  ok("procedure: another admission's requirement (50007)", (await spErr(F.aT, F.rb3, S1, E1, F.tB, u)) === 50007);
  ok('procedure: resource type differs from requirement (50008)', (await spErr(F.aS, F.rb3, S1, E1, F.tChair, u)) === 50008);
  ok('procedure: failed calls rolled back, nothing left behind', (await q('SELECT COUNT(*) n FROM resource_allocation WHERE admission_id=?', [F.aS]))[0].n === 2);
  const c1 = await mysql.createConnection(cfg), c2 = await mysql.createConnection(cfg);
  const rs = await Promise.allSettled([sp(c1, F.aS, F.rcon, S1, E1, null, u), sp(c2, F.aS, F.rcon, S1, E1, null, u)]);
  await c1.end(); await c2.end();
  ok('concurrency: two simultaneous identical bookings, exactly one wins, the other gets 50009',
    rs.filter((r) => r.status === 'fulfilled').length === 1 && rs.filter((r) => r.status === 'rejected' && r.reason.errno === 50009).length === 1);

  const sets = (res) => res.filter(Array.isArray);
  await multi.query('SET @window_start=?, @window_end=?, @resource_type=?, @facility_id=?', [S1, E1, 'ZZMT_SQLBED', F.f1]);
  const file = (n) => { const p = path.join(ROOT, 'db', 'mysql', 'queries', n); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
  const avSql = file('available_resources_subquery.sql');
  if (!ok('queries/available_resources_subquery.sql exists', avSql)) return;
  let ids = sets((await multi.query(avSql))[0]).at(-1).map((r) => r.resource_id);
  ok('availability subquery: free beds listed; booked, MAINTENANCE and other-type resources excluded',
    ids.includes(F.rb3) && ids.includes(F.rb4) && !ids.includes(F.rb1) && !ids.includes(F.rcon) && !ids.includes(F.rb2) && !ids.includes(F.rc));
  await multi.query('SET @window_start=?, @window_end=?', ['2031-01-01 14:00:00', '2031-01-01 15:00:00']);
  ids = sets((await multi.query(avSql))[0]).at(-1).map((r) => r.resource_id);
  ok('availability subquery: window that only touches the end of a booking counts as free', ids.includes(F.rb1));

  const trxSql = file('allocation_transaction.sql');
  if (ok('queries/allocation_transaction.sql exists', trxSql)) {
    const run = async () => {
      await multi.query('SET @admission_id=?, @resource_id=?, @start_time=?, @end_time=?, @requirement_id=?, @allocated_by=?', [F.aS, F.rc, S1, E1, F.tChair, u]);
      const [res] = await multi.query(trxSql);
      return Number(sets(res).flat().find((r) => r && 'allocated' in r)?.allocated);
    };
    ok('plain-SQL transaction: first booking succeeds', (await run()) === 1);
    ok('plain-SQL transaction: requirement became ALLOCATED', (await reqSt(F.tChair)) === 'ALLOCATED');
    ok('plain-SQL transaction: identical second booking refused', (await run()) === 0);
  }
  const utilSql = file('utilization_and_outstanding.sql');
  if (ok('queries/utilization_and_outstanding.sql exists', utilSql)) {
    await multi.query("SET @util_from='2031-01-01 00:00:00', @util_to='2031-01-02 00:00:00'");
    const s = sets((await multi.query(utilSql))[0]);
    ok('GROUP BY/HAVING: four result sets returned', s.length === 4, `(${s.length})`);
    ok('utilization: bed rb1 booked 240 minutes in the window', Number(s[0]?.find((r) => r.resource_id === F.rb1)?.booked_minutes) === 240);
    ok('utilization HAVING hides a never-booked resource', !s[0]?.some((r) => r.resource_id === F.rb4));
    ok('outstanding requirements per plan: 3 for the test plan', Number(s[2]?.find((r) => r.discharge_id === F.dS)?.outstanding_requirements) === 3);
  }

  await q("UPDATE resource_allocation SET allocation_status='COMPLETED' WHERE allocation_id=?", [al1]);
  ok('trigger: allocation COMPLETED -> requirement FULFILLED', (await reqSt(F.tA)) === 'FULFILLED');
  const W = ['2031-01-02 10:00:00', '2031-01-02 12:00:00'];
  const al3 = await sp(sc, F.aS, F.rb1, ...W, F.tB, u), al4 = await sp(sc, F.aS, F.rb3, ...W, F.tB, u);
  ok('two bookings for one requirement -> ALLOCATED', (await reqSt(F.tB)) === 'ALLOCATED');
  await q("UPDATE resource_allocation SET allocation_status='CANCELLED' WHERE allocation_id=?", [al3]);
  ok('trigger: cancelling one of two bookings keeps the requirement ALLOCATED', (await reqSt(F.tB)) === 'ALLOCATED' && (await alSt(al4)) === 'ACTIVE');
  await q("UPDATE resource_allocation SET allocation_status='CANCELLED' WHERE allocation_id=?", [al4]);
  ok('trigger: cancelling the last booking -> requirement back to PENDING', (await reqSt(F.tB)) === 'PENDING');
  await sc.end();

  const vw = async (d) => (await q('SELECT * FROM v_transition_readiness WHERE discharge_id=?', [d]));
  const st = async (d) => (await vw(d))[0]?.readiness_status;
  let v = await vw(F.dS);
  ok('view: one row per plan; counts not multiplied by allocations (3 total, 1 fulfilled, 2 outstanding)',
    v.length === 1 && Number(v[0].total_requirements) === 3 && Number(v[0].fulfilled_requirements) === 1 && Number(v[0].outstanding_requirements) === 2);
  ok('view: plan with no requirements -> NO_REQUIREMENTS', (await st(F.dV)) === 'NO_REQUIREMENTS');
  const tV = await ins("INSERT INTO transition_requirement (discharge_id,recovery_id,resource_type,status) VALUES (?,?, 'ZZMT_SQLBED','PENDING')", [F.dV, F.rS]);
  ok('view: pending requirement -> REQUIREMENTS_OUTSTANDING', (await st(F.dV)) === 'REQUIREMENTS_OUTSTANDING');
  await q("UPDATE transition_requirement SET status='FULFILLED' WHERE requirement_id=?", [tV]);
  ok('view: all fulfilled, destination set, no handoff -> AWAITING_HANDOFF', (await st(F.dV)) === 'AWAITING_HANDOFF');
  const h = await ins("INSERT INTO care_handoff (admission_id,discharge_id,from_facility_id,to_facility_id,status,handoff_date,created_by) VALUES (?,?,?,?, 'SENT','2031-02-05 12:00:00',?)", [F.aV, F.dV, F.f1, F.f2, u]);
  ok('view: handoff SENT -> AWAITING_HANDOFF', (await st(F.dV)) === 'AWAITING_HANDOFF');
  await q("UPDATE care_handoff SET status='REJECTED' WHERE handoff_id=?", [h]);
  ok('view: handoff REJECTED -> HANDOFF_REJECTED', (await st(F.dV)) === 'HANDOFF_REJECTED');
  await q("UPDATE care_handoff SET status='ACKNOWLEDGED', acknowledged_at='2031-02-05 13:00:00' WHERE handoff_id=?", [h]);
  ok('view: handoff ACKNOWLEDGED -> READY', (await st(F.dV)) === 'READY');
  const tV2 = await ins("INSERT INTO transition_requirement (discharge_id,recovery_id,resource_type,status) VALUES (?,?, 'ZZMT_SQLBED','FULFILLED')", [F.dV2, F.rS]);
  ok('view: fulfilled plan with no destination (going home) -> READY', (await st(F.dV2)) === 'READY' && tV2 > 0);
  await q("UPDATE discharge_plan SET status='COMPLETED' WHERE discharge_id=?", [F.dV2]);
  ok('view: COMPLETED plan -> COMPLETED', (await st(F.dV2)) === 'COMPLETED');
  await q("UPDATE discharge_plan SET status='CANCELLED' WHERE discharge_id=?", [F.dV2]);
  ok('view: CANCELLED plan -> CANCELLED', (await st(F.dV2)) === 'CANCELLED');
});

// =================================================================== 5. AUTH + SECURITY
await guarded('auth', async () => {
  section('5. Authentication, roles, CSRF, throttling');
  const bad = await login(F.coord.email, 'wrong');
  ok('wrong password -> 401 INVALID_CREDENTIALS', is(bad, 401, 'INVALID_CREDENTIALS'));
  const unk = await login(`nobody-${tag}@example.test`);
  ok('unknown email -> identical status and message (no account enumeration)', unk.status === 401 && unk.msg === bad.msg);
  ok('inactive account -> 401', (await login(F.inactive.email)).status === 401);
  ok('account without a role -> 403 NO_ROLE', is(await login(F.norole.email), 403, 'NO_ROLE'));
  ok('missing password -> 422', (await call('POST', '/api/auth/login', { body: { email: F.coord.email }, anon: true })).status === 422);
  const good = await login(F.coord.email); S = good.cookie;
  ok('correct login -> 200 with user and roles', good.status === 200 && good.data.user.roles.includes('CARE_COORDINATOR'));
  ok('response never contains a password hash', !JSON.stringify(good.data).toLowerCase().includes('hash'));
  ok('session cookie is HttpOnly and SameSite=Lax', good.cookie.length > 20 && /HttpOnly/i.test(good.raw) && /SameSite=lax/i.test(good.raw));
  const dbHash = (await q('SELECT password_hash h FROM app_user WHERE user_id=?', [F.coord.id]))[0].h;
  ok('stored password is a bcrypt hash, not plain text', /^\$2[aby]\$/.test(dbHash) && dbHash !== 'password123');
  ok('/me with cookie -> the same user', (await call('GET', '/api/auth/me')).data?.user?.userId === F.coord.id);
  ok('/me without cookie -> 401', is(await call('GET', '/api/auth/me', { anon: true }), 401));
  ok('/me with tampered cookie -> 401', is(await call('GET', '/api/auth/me', { cookie: S + 'x' }), 401));
  const adm = await login(F.admin.email);
  ok('ADMIN role can use the system too', adm.status === 200 && (await call('GET', '/api/resources?limit=1', { cookie: adm.cookie })).status === 200);
  const lo = await call('POST', '/api/auth/logout', { body: {}, anon: true });
  ok('logout clears the cookie', lo.status === 200 && (lo.res.headers.getSetCookie().find((c) => c.startsWith('coc_session=')) ?? '').startsWith('coc_session=;'));
  const dl = await login(F.deact.email);
  ok('deactivated user: a still-valid token stops working immediately', (await call('GET', '/api/auth/me', { cookie: dl.cookie })).status === 200
    && (await q("UPDATE app_user SET status='INACTIVE' WHERE user_id=?", [F.deact.id]), (await call('GET', '/api/auth/me', { cookie: dl.cookie })).status === 401));
  const dm = await login(F.demote.email);
  await q('DELETE FROM user_role WHERE user_id=?', [F.demote.id]);
  ok('role removed mid-session: API access refused at once (403)', (await call('POST', '/api/semantic-search', { cookie: dm.cookie, body: { query: 'x' } })).status === 403);

  const codes = []; for (let i = 0; i < 6; i++) codes.push((await login(F.thr.email, 'bad')).status);
  ok('throttling: 5 failures -> 401, 6th -> 429', codes.slice(0, 5).every((c) => c === 401) && codes[5] === 429, `(${codes})`);
  ok('throttling: even the right password is refused while throttled', (await login(F.thr.email)).status === 429);

  const body = { admissionId: F.a1, doctorId: F.dA, dischargeDate: '2031-02-01T10:00' };
  ok('CSRF: cross-origin POST with a valid cookie -> 403', is(await call('POST', '/api/discharge-plans', { body, headers: { origin: 'http://evil.example' } }), 403, 'CSRF_REJECTED'));
  const tp = await fetch(BASE + '/api/discharge-plans', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: S }, body: JSON.stringify(body) });
  ok('CSRF: non-JSON content type -> 415', tp.status === 415);

  const anonList = [['GET', '/api/auth/me'], ['GET', '/api/patients'], ['GET', '/api/facilities'], ['GET', '/api/admissions?patientId=1'], ['GET', '/api/resources'],
    ['GET', '/api/resources/available?start=2031-01-01T10:00&end=2031-01-01T11:00'], ['GET', '/api/discharge-plans/1'], ['POST', '/api/discharge-plans', {}],
    ['PATCH', '/api/discharge-plans/1', { notes: 'x' }], ['POST', '/api/resource-allocations', {}], ['PATCH', '/api/resource-allocations/1', { status: 'COMPLETED' }],
    ['GET', '/api/transition-requirements/1'], ['POST', '/api/transition-requirements', {}], ['PATCH', '/api/transition-requirements/1', { requiredForm: 'x' }],
    ['GET', '/api/recovery-episodes/1'], ['POST', '/api/recovery-episodes', {}], ['POST', '/api/handoffs', {}], ['GET', '/api/handoffs/1'], ['POST', '/api/handoffs/1/send', {}],
    ['POST', '/api/handoffs/1/acknowledge', {}], ['POST', '/api/handoffs/1/reject', {}], ['GET', '/api/documents'], ['POST', '/api/documents', {}], ['GET', '/api/documents/1'],
    ['PATCH', '/api/documents/1', { status: 'DRAFT' }], ['POST', '/api/semantic-search', { query: 'x' }], ['GET', '/api/transition-readiness/1']];
  const bad401 = []; for (const [m, p, b] of anonList) { const r = await call(m, p, { anon: true, body: b }); if (r.status !== 401) bad401.push(`${m} ${p}=${r.status}`); }
  ok(`all ${anonList.length} protected endpoints reject anonymous callers (401)`, bad401.length === 0, bad401.join('; '));
  const bearer = await ext('GET', '/api/resources', 'coc_1_' + 'A'.repeat(43));
  ok('an API-client bearer token does not work on the internal API', bearer.status === 401);
});

// =================================================================== 6. WORKFLOW VIA API
await guarded('workflow', async () => {
  section('6. Full workflow through the API');
  const P = (p, body) => call('POST', p, { body }), PA = (p, body) => call('PATCH', p, { body });
  const plan = { admissionId: F.a1, doctorId: F.dA, dischargeDate: '2031-02-01T10:00', destinationFacilityId: F.f2, notes: 'first' };
  let r;
  ok('plan: doctor not assigned to the admission -> 422', is(await P('/api/discharge-plans', { ...plan, doctorId: F.dB }), 422, 'DOCTOR_NOT_ASSIGNED'));
  ok('plan: destination equal to admission facility -> 422', is(await P('/api/discharge-plans', { ...plan, destinationFacilityId: F.f1 }), 422, 'SAME_FACILITY'));
  ok('plan: unknown admission -> 404', is(await P('/api/discharge-plans', { ...plan, admissionId: 900000000 }), 404, 'ADMISSION_NOT_FOUND'));
  ok('plan: discharge before admission -> 422', is(await P('/api/discharge-plans', { ...plan, dischargeDate: '2030-12-31T10:00' }), 422, 'DATE_BEFORE_ADMISSION'));
  ok('plan: impossible date -> 422', is(await P('/api/discharge-plans', { ...plan, dischargeDate: '2031-13-45T10:00' }), 422, 'VALIDATION_ERROR'));
  ok('plan: unknown field (status) rejected', is(await P('/api/discharge-plans', { ...plan, status: 'READY' }), 422, 'VALIDATION_ERROR'));
  r = await P('/api/discharge-plans', plan); X.plan1 = r.data?.dischargePlan?.dischargeId;
  ok('plan: created PLANNED, date normalised, names joined', r.status === 201 && r.data.dischargePlan.status === 'PLANNED' && r.data.dischargePlan.dischargeDate === '2031-02-01 10:00:00'
    && r.data.dischargePlan.patientName === 'ZZMT Zebra Patient' && r.data.dischargePlan.destinationFacilityName === 'ZZMT F2');
  ok('plan: second open plan for the admission -> 409', is(await P('/api/discharge-plans', plan), 409, 'OPEN_PLAN_EXISTS'));
  ok('plan: unknown id -> 404, non-numeric id -> 400', is(await call('GET', '/api/discharge-plans/900000000'), 404) && is(await call('GET', '/api/discharge-plans/abc'), 400, 'INVALID_ID'));
  ok('plan: empty PATCH -> 422', is(await PA(`/api/discharge-plans/${X.plan1}`, {}), 422));
  ok('plan: notes updated', (await PA(`/api/discharge-plans/${X.plan1}`, { notes: 'updated' })).data?.dischargePlan?.notes === 'updated');
  ok('plan: PLANNED -> COMPLETED not allowed', is(await PA(`/api/discharge-plans/${X.plan1}`, { status: 'COMPLETED' }), 409, 'INVALID_TRANSITION'));

  ok('recovery: end before start -> 422', is(await P('/api/recovery-episodes', { patientId: F.p1, facilityId: F.f2, startDate: '2031-02-10', endDate: '2031-02-01' }), 422));
  ok('recovery: status COMPLETED on creation -> 422', is(await P('/api/recovery-episodes', { patientId: F.p1, facilityId: F.f2, startDate: '2031-02-10', status: 'COMPLETED' }), 422));
  ok('recovery: unknown patient / facility -> 404', is(await P('/api/recovery-episodes', { patientId: 900000000, facilityId: F.f2, startDate: '2031-02-10' }), 404, 'PATIENT_NOT_FOUND')
    && is(await P('/api/recovery-episodes', { patientId: F.p1, facilityId: 900000000, startDate: '2031-02-10' }), 404, 'FACILITY_NOT_FOUND'));
  r = await P('/api/recovery-episodes', { patientId: F.p1, facilityId: F.f2, startDate: '2031-02-10', status: 'ACTIVE' }); X.R1 = r.data?.recoveryEpisode?.recoveryId;
  ok('recovery: created with patient and facility names', r.status === 201 && r.data.recoveryEpisode.patientName === 'ZZMT Zebra Patient' && r.data.recoveryEpisode.facilityName === 'ZZMT F2');
  ok('recovery: GET works, unknown -> 404', (await call('GET', `/api/recovery-episodes/${X.R1}`)).data?.recoveryEpisode?.status === 'ACTIVE' && is(await call('GET', '/api/recovery-episodes/900000000'), 404, 'RECOVERY_NOT_FOUND'));
  X.R2 = (await P('/api/recovery-episodes', { patientId: F.p2, facilityId: F.f2, startDate: '2031-02-10' })).data?.recoveryEpisode?.recoveryId;
  X.R3 = await ins("INSERT INTO recovery_episode (patient_id,facility_id,start_date,status) VALUES (?,?, '2031-01-01','COMPLETED')", [F.p1, F.f2]);

  const QB = { dischargeId: X.plan1, recoveryId: X.R1, resourceType: 'ZZMT_BED' };
  ok('requirement: unknown plan / recovery -> 404', is(await P('/api/transition-requirements', { ...QB, dischargeId: 900000000 }), 404, 'DISCHARGE_NOT_FOUND') && is(await P('/api/transition-requirements', { ...QB, recoveryId: 900000000 }), 404, 'RECOVERY_NOT_FOUND'));
  ok("requirement: another patient's recovery episode -> 422", is(await P('/api/transition-requirements', { ...QB, recoveryId: X.R2 }), 422, 'RECOVERY_PATIENT_MISMATCH'));
  ok('requirement: COMPLETED recovery episode -> 409', is(await P('/api/transition-requirements', { ...QB, recoveryId: X.R3 }), 409, 'RECOVERY_CLOSED'));
  const mkReq = async (b) => (await P('/api/transition-requirements', b)).data?.requirement?.requirementId;
  X.q1 = await mkReq(QB); X.q3 = await mkReq(QB); X.q4 = await mkReq({ ...QB, resourceType: 'ZZMT_CHAIR' });
  r = await P('/api/transition-requirements', { ...QB, resourceType: 'ZZMT_FORM', requiredForm: 'Consent form', requiredUntil: '2031-02-09T17:00' }); X.q2 = r.data?.requirement?.requirementId;
  ok('requirement: created PENDING; form and deadline stored', X.q1 && r.status === 201 && r.data.requirement.requiredForm === 'Consent form' && r.data.requirement.requiredUntil === '2031-02-09 17:00:00');
  ok('requirement: unknown id -> 404; target status ALLOCATED not accepted', is(await call('GET', '/api/transition-requirements/900000000'), 404, 'REQUIREMENT_NOT_FOUND') && is(await PA(`/api/transition-requirements/${X.q1}`, { status: 'ALLOCATED' }), 422));
  ok('plan: READY refused while requirements are outstanding', is(await PA(`/api/discharge-plans/${X.plan1}`, { status: 'READY' }), 409, 'REQUIREMENTS_OUTSTANDING'));

  const W = ['2031-03-01T10:00', '2031-03-01T12:00'];
  r = await call('GET', '/api/resources?resourceType=ZZMT_BED');
  ok('resources: list by type', r.status === 200 && r.data.resources.length === 2);
  ok('resources: filter by availability', (await call('GET', '/api/resources?resourceType=ZZMT_BED&availability=AVAILABLE')).data.resources.map((x) => x.resourceId).join() === String(F.ab1));
  r = await call('GET', `/api/resources?resourceType=ZZMT_CHAIR&facilityId=${F.f2}`);
  ok('resources: filter by type and facility; facility name joined', r.data.resources.length === 1 && r.data.resources[0].facilityName === 'ZZMT F2');
  ok('resources: limit respected; bad enum / unknown parameter -> 422', (await call('GET', '/api/resources?resourceType=ZZMT_BED&limit=1')).data.resources.length === 1
    && (await call('GET', '/api/resources?availability=BROKEN')).status === 422 && (await call('GET', '/api/resources?foo=1')).status === 422);
  const avail = async () => (await call('GET', `/api/resources/available?start=${W[0]}&end=${W[1]}&resourceType=ZZMT_BED`)).data?.resources?.map((x) => x.resourceId) ?? [];
  let av = await avail();
  ok('availability: free bed listed, MAINTENANCE bed not', av.includes(F.ab1) && !av.includes(F.ab2));
  ok('availability: missing start / end <= start -> 422', (await call('GET', `/api/resources/available?end=${W[1]}`)).status === 422 && (await call('GET', `/api/resources/available?start=${W[1]}&end=${W[1]}`)).status === 422);

  const A = { admissionId: F.a1, resourceId: F.ab1, startTime: W[0], endTime: W[1], requirementId: X.q1 };
  ok('allocation: client-supplied allocatedBy rejected', is(await P('/api/resource-allocations', { ...A, allocatedBy: 1 }), 422));
  ok('allocation: end before start -> 422', is(await P('/api/resource-allocations', { ...A, endTime: '2031-03-01T09:00' }), 422));
  r = await P('/api/resource-allocations', A); X.al1 = r.data?.allocation?.allocationId;
  ok('allocation: booked ACTIVE, allocatedBy = session user, type copied, requirement ALLOCATED',
    r.status === 201 && r.data.allocation.allocationStatus === 'ACTIVE' && r.data.allocation.allocatedBy === F.coord.id && r.data.allocation.resourceType === 'ZZMT_BED' && r.data.requirementStatus === 'ALLOCATED');
  ok('allocation: overlapping window -> 409 RESOURCE_CONFLICT', is(await P('/api/resource-allocations', { ...A, requirementId: X.q3, startTime: '2031-03-01T11:00', endTime: '2031-03-01T13:00' }), 409, 'RESOURCE_CONFLICT'));
  av = await avail(); ok('availability: booked bed disappears from the free list', !av.includes(F.ab1));
  ok('allocation: MAINTENANCE resource -> 409', is(await P('/api/resource-allocations', { ...A, resourceId: F.ab2, requirementId: X.q3 }), 409, 'RESOURCE_NOT_AVAILABLE'));
  ok('allocation: unknown resource -> 404', is(await P('/api/resource-allocations', { ...A, resourceId: 900000000, requirementId: X.q3 }), 404, 'RESOURCE_NOT_FOUND'));
  ok('allocation: chair for a bed requirement -> 422', is(await P('/api/resource-allocations', { ...A, resourceId: F.ach, requirementId: X.q3 }), 422, 'RESOURCE_TYPE_MISMATCH'));
  ok("allocation: requirement of another admission -> 422", is(await P('/api/resource-allocations', { ...A, admissionId: F.a2, requirementId: X.q3, startTime: '2031-03-05T10:00', endTime: '2031-03-05T12:00' }), 422, 'REQUIREMENT_ADMISSION_MISMATCH'));
  ok('requirement: type frozen once ALLOCATED; ALLOCATED -> FULFILLED by hand refused',
    is(await PA(`/api/transition-requirements/${X.q1}`, { resourceType: 'ZZMT_X' }), 409, 'REQUIREMENT_IN_USE') && is(await PA(`/api/transition-requirements/${X.q1}`, { status: 'FULFILLED' }), 409, 'INVALID_TRANSITION'));
  ok('allocation: invalid target status -> 422; unknown id -> 404', is(await PA(`/api/resource-allocations/${X.al1}`, { status: 'ACTIVE' }), 422) && is(await PA('/api/resource-allocations/900000000', { status: 'COMPLETED' }), 404));
  r = await PA(`/api/resource-allocations/${X.al1}`, { status: 'COMPLETED' });
  ok('allocation: COMPLETED -> requirement FULFILLED (trigger)', r.status === 200 && r.data.requirementStatus === 'FULFILLED');
  ok('allocation: already COMPLETED -> 409', is(await PA(`/api/resource-allocations/${X.al1}`, { status: 'CANCELLED' }), 409, 'ALLOCATION_NOT_ACTIVE'));
  r = await P('/api/resource-allocations', { ...A, requirementId: X.q3, startTime: '2031-03-01T12:00', endTime: '2031-03-01T14:00' }); const al2 = r.data?.allocation?.allocationId;
  ok('allocation: back-to-back booking accepted', r.status === 201);
  ok('allocation: CANCELLED -> requirement back to PENDING', (await PA(`/api/resource-allocations/${al2}`, { status: 'CANCELLED' })).data?.requirementStatus === 'PENDING');
  r = await P('/api/resource-allocations', { ...A, requirementId: X.q3, startTime: '2031-03-02T10:00', endTime: '2031-03-02T12:00' });
  ok('allocation: rebooked and completed -> FULFILLED', r.status === 201 && (await PA(`/api/resource-allocations/${r.data.allocation.allocationId}`, { status: 'COMPLETED' })).data?.requirementStatus === 'FULFILLED');
  ok('requirement: PENDING -> FULFILLED (form-only)', (await PA(`/api/transition-requirements/${X.q2}`, { status: 'FULFILLED' })).data?.requirement?.status === 'FULFILLED');
  ok('requirement: fulfilled requirement cannot change', is(await PA(`/api/transition-requirements/${X.q2}`, { status: 'CANCELLED' }), 409, 'REQUIREMENT_CLOSED'));
  r = await P('/api/resource-allocations', { admissionId: F.a1, resourceId: F.ach, startTime: W[0], endTime: W[1], requirementId: X.q4 }); const alc = r.data?.allocation?.allocationId;
  r = await PA(`/api/transition-requirements/${X.q4}`, { status: 'CANCELLED' });
  ok('requirement: cancelling an ALLOCATED one also cancels its live booking', r.status === 200 && r.data.requirement.status === 'CANCELLED' && (await q('SELECT allocation_status s FROM resource_allocation WHERE allocation_id=?', [alc]))[0].s === 'CANCELLED');
  ok('requirement: cancelled requirement cannot change', is(await PA(`/api/transition-requirements/${X.q4}`, { requiredForm: 'x' }), 409, 'REQUIREMENT_CLOSED'));

  ok('plan: -> READY once nothing is outstanding', (await PA(`/api/discharge-plans/${X.plan1}`, { status: 'READY' })).data?.dischargePlan?.status === 'READY');
  ok('requirement: cannot add to a READY plan', is(await P('/api/transition-requirements', QB), 409, 'PLAN_NOT_PLANNED'));
  ok('plan: COMPLETED refused without an acknowledged handoff', is(await PA(`/api/discharge-plans/${X.plan1}`, { status: 'COMPLETED' }), 409, 'HANDOFF_NOT_ACKNOWLEDGED'));
  ok('plan: readiness inside the plan detail -> AWAITING_HANDOFF', (await call('GET', `/api/discharge-plans/${X.plan1}`)).data?.dischargePlan?.readiness?.readinessStatus === 'AWAITING_HANDOFF');

  const HB = { dischargeId: X.plan1, handoffDate: '2031-02-11T09:00' };
  ok('handoff: unknown plan -> 404; client-supplied facilities rejected', is(await P('/api/handoffs', { ...HB, dischargeId: 900000000 }), 404) && is(await P('/api/handoffs', { ...HB, toFacilityId: F.f1 }), 422, 'VALIDATION_ERROR'));
  X.plan4 = (await P('/api/discharge-plans', { admissionId: F.a4, doctorId: F.dA, dischargeDate: '2031-02-01T10:00' })).data?.dischargePlan?.dischargeId;
  ok('handoff: plan without a destination -> 422 NO_DESTINATION', is(await P('/api/handoffs', { dischargeId: X.plan4, handoffDate: '2031-02-11T09:00' }), 422, 'NO_DESTINATION'));
  r = await P('/api/handoffs', HB); X.h1 = r.data?.handoff?.handoffId;
  ok('handoff: PREPARED; facilities derived from admission and plan; creator = session user',
    r.status === 201 && r.data.handoff.status === 'PREPARED' && r.data.handoff.fromFacilityId === F.f1 && r.data.handoff.toFacilityId === F.f2 && r.data.handoff.createdBy === F.coord.id);
  ok('handoff: second live handoff -> 409', is(await P('/api/handoffs', HB), 409, 'ACTIVE_HANDOFF_EXISTS'));
  ok('handoff: acknowledge before send -> 409', is(await P(`/api/handoffs/${X.h1}/acknowledge`, {}), 409, 'INVALID_TRANSITION'));
  ok('handoff: send -> SENT', (await P(`/api/handoffs/${X.h1}/send`, {})).data?.handoff?.status === 'SENT');
  r = await P(`/api/handoffs/${X.h1}/acknowledge`, {});
  ok('handoff: acknowledge -> ACKNOWLEDGED with timestamp', r.status === 200 && r.data.handoff.status === 'ACKNOWLEDGED' && r.data.handoff.acknowledgedAt);
  ok('handoff: acknowledge twice -> 409; GET works; unknown -> 404', is(await P(`/api/handoffs/${X.h1}/acknowledge`, {}), 409) && (await call('GET', `/api/handoffs/${X.h1}`)).data?.handoff?.toFacilityName === 'ZZMT F2' && is(await call('GET', '/api/handoffs/900000000'), 404, 'HANDOFF_NOT_FOUND'));
  ok('plan: COMPLETED after acknowledgement; admission.discharge_date filled', (await PA(`/api/discharge-plans/${X.plan1}`, { status: 'COMPLETED' })).data?.dischargePlan?.status === 'COMPLETED' && (await q('SELECT discharge_date d FROM admission WHERE admission_id=?', [F.a1]))[0].d !== null);
  ok('plan: closed plan cannot be edited', is(await PA(`/api/discharge-plans/${X.plan1}`, { notes: 'late' }), 409, 'PLAN_CLOSED'));

  X.plan2 = (await P('/api/discharge-plans', { admissionId: F.a2, doctorId: F.dA, dischargeDate: '2031-02-01T10:00', destinationFacilityId: F.f2 })).data?.dischargePlan?.dischargeId;
  X.h2 = (await P('/api/handoffs', { dischargeId: X.plan2, handoffDate: '2031-02-11T09:00' })).data?.handoff?.handoffId;
  ok('handoff: prepared on a PLANNED plan, but send refused until READY', X.h2 && is(await P(`/api/handoffs/${X.h2}/send`, {}), 409, 'PLAN_NOT_READY'));
  await PA(`/api/discharge-plans/${X.plan2}`, { status: 'READY' });
  await P(`/api/handoffs/${X.h2}/send`, {});
  ok('handoff: reject -> REJECTED', (await P(`/api/handoffs/${X.h2}/reject`, {})).data?.handoff?.status === 'REJECTED');
  X.h2b = (await P('/api/handoffs', { dischargeId: X.plan2, handoffDate: '2031-02-12T09:00' })).data?.handoff?.handoffId;
  ok('handoff: a rejected handoff can be replaced; replacement sent', X.h2b && (await P(`/api/handoffs/${X.h2b}/send`, {})).data?.handoff?.status === 'SENT');
  X.plan3 = (await P('/api/discharge-plans', { admissionId: F.a3, doctorId: F.dA, dischargeDate: '2031-02-01T10:00', destinationFacilityId: F.f2 })).data?.dischargePlan?.dischargeId;
  await PA(`/api/discharge-plans/${X.plan3}`, { status: 'READY' });
  X.h3 = (await P('/api/handoffs', { dischargeId: X.plan3, handoffDate: '2031-02-11T09:00' })).data?.handoff?.handoffId;
  ok('handoff: third plan prepared, ready and sent (kept for the external API)', X.h3 && (await P(`/api/handoffs/${X.h3}/send`, {})).data?.handoff?.status === 'SENT');
});

// =================================================================== 7. DOCUMENTS + SEARCH
await guarded('documents', async () => {
  section('7. Documents, ingestion, semantic search');
  const P = (p, body) => call('POST', p, { body }), PA = (p, body) => call('PATCH', p, { body });
  const RAMP = 'A temporary ramp or step-free entry must be arranged because the front door has two steps. A wheelchair will be needed outdoors.';
  const PHYSIO = 'Physiotherapy twice a week focuses on walking practice, balance training and strengthening of the hip.';
  const BILL = 'This letter confirms the insurance claim number and the billing address. Payment is due within thirty days.';
  const QRY = 'how will she get into the house with the steps at the door';
  const D = { patientId: F.p1, documentType: 'ZZMT_NOTE', title: 'ZZMT ramp note', source: 'master-test' };
  const chunks = async (d) => (await pgp.query('SELECT count(*)::int n FROM care_document_chunk WHERE document_id=$1', [d])).rows[0].n;
  const ids = (r) => r.data?.results?.map((x) => x.documentId) ?? [];
  const srch = (b) => P('/api/semantic-search', { query: QRY, ...b });

  ok('document: admission of another patient -> 422', is(await P('/api/documents', { ...D, admissionId: F.a3 }), 422, 'ADMISSION_PATIENT_MISMATCH'));
  ok('document: unknown patient -> 404; ARCHIVED on creation -> 422; unknown field -> 422', is(await P('/api/documents', { ...D, patientId: 900000000 }), 404) && is(await P('/api/documents', { ...D, status: 'ARCHIVED' }), 422) && is(await P('/api/documents', { ...D, createdBy: 1 }), 422));
  let r = await P('/api/documents', { ...D, title: 'ZZMT draft', text: RAMP }); X.dDraft = r.data?.document?.documentId;
  ok('document: DRAFT with text saved, ingestion SKIPPED, createdBy = session user, no chunks', r.status === 201 && r.data.ingestion.status === 'SKIPPED' && r.data.document.createdBy === F.coord.id && (await chunks(X.dDraft)) === 0 && fs.existsSync(path.join(DOCDIR, `${X.dDraft}.txt`)));
  console.log('   (first ingestion loads the embedding model inside the server; allow a few seconds)');
  r = await P('/api/documents', { ...D, admissionId: F.a1, status: 'APPROVED', text: RAMP }); X.dRamp = r.data?.document?.documentId;
  ok('document: APPROVED with text is ingested at once; chunk count matches PostgreSQL', r.status === 201 && r.data.ingestion.status === 'INGESTED' && r.data.ingestion.chunks >= 1 && (await chunks(X.dRamp)) === r.data.document.chunkCount);
  r = await P('/api/documents', { ...D, title: 'ZZMT physio', documentType: 'ZZMT_REHAB', recoveryId: X.R1, status: 'APPROVED', text: PHYSIO }); X.dPhysio = r.data?.document?.documentId;
  r = await P('/api/documents', { ...D, title: 'ZZMT notext', status: 'APPROVED' }); X.dNoText = r.data?.document?.documentId;
  ok('document: APPROVED without text -> saved but ingestion FAILED (TEXT_NOT_FOUND)', r.status === 201 && r.data.ingestion.status === 'FAILED' && r.data.ingestion.code === 'TEXT_NOT_FOUND');
  r = await P('/api/documents', { ...D, patientId: F.p2, documentType: 'ZZMT_BILL', title: 'ZZMT bill', status: 'APPROVED', text: BILL }); X.dBill = r.data?.document?.documentId;
  ok('document: second patient document ingested', r.data?.ingestion?.status === 'INGESTED');
  const L = (await call('GET', `/api/documents?patientId=${F.p1}&limit=20`)).data?.documents ?? [];
  ok('documents list: filtered by patient, shows chunk counts', L.length === 4 && L.find((d) => d.documentId === X.dRamp)?.chunkCount >= 1 && L.find((d) => d.documentId === X.dDraft)?.chunkCount === 0);
  ok('documents: GET one; unknown -> 404', (await call('GET', `/api/documents/${X.dRamp}`)).data?.document?.patientName === 'ZZMT Zebra Patient' && is(await call('GET', '/api/documents/900000000'), 404, 'DOCUMENT_NOT_FOUND'));

  ok('search: blank query / limit 51 / unknown filter field -> 422', is(await P('/api/semantic-search', { query: '  ' }), 422) && is(await srch({ limit: 51 }), 422) && is(await srch({ filters: { patientName: 'x' } }), 422));
  r = await srch({ filters: { patientId: F.p1 } }); const top = r.data?.results?.[0];
  ok('search: a paraphrase finds the ramp document first (meaning, not keywords)', r.status === 200 && top?.documentId === X.dRamp && top.similarity > 0.3, `(similarity ${top?.similarity?.toFixed(3)})`);
  ok('search: hit carries chunk id, content, metadata and source-document context', top && top.chunkId && top.content && top.metadata?.patientId === F.p1 && top.document?.title === 'ZZMT ramp note' && top.document?.patientName === 'ZZMT Zebra Patient' && top.document?.documentType === 'ZZMT_NOTE');
  ok('search: results sorted by similarity, highest first', r.data.results.every((x, i, a) => i === 0 || a[i - 1].similarity >= x.similarity));
  ok('search: DRAFT and text-less documents never returned', !ids(r).includes(X.dDraft) && !ids(r).includes(X.dNoText));
  ok("search: other patient's document never leaks into a patient-filtered search", !ids(r).includes(X.dBill));
  const all = await srch({ filters: {}, limit: 50 }); const rank = (d) => ids(all).indexOf(d);
  ok('search: unfiltered, the ramp passage outranks the unrelated billing letter', rank(X.dRamp) >= 0 && (rank(X.dBill) === -1 || rank(X.dRamp) < rank(X.dBill)));
  ok('search: filter by document type', ids(await srch({ filters: { documentType: 'ZZMT_BILL' } })).every((d) => d === X.dBill) && ids(await srch({ filters: { documentType: 'ZZMT_BILL' } })).length > 0);
  ok('search: filter by admission', ids(await srch({ filters: { admissionId: F.a1 } })).join() === String(X.dRamp));
  ok('search: filter by recovery episode', ids(await srch({ filters: { recoveryId: X.R1 } })).join() === String(X.dPhysio));
  ok('search: conflicting filters -> empty result, not an error', (await srch({ filters: { patientId: F.p1, documentType: 'ZZMT_BILL' } })).data?.count === 0);
  ok('search: limit 1 returns one result; minSimilarity 0.99 returns none', (await srch({ limit: 1 })).data?.results?.length === 1 && (await srch({ minSimilarity: 0.99 })).data?.count === 0);
  const off = await P('/api/semantic-search', { query: 'quarterly budget spreadsheet formulas', filters: { patientId: F.p1 } });
  ok('search: an unrelated query scores lower than the relevant one', off.data?.results?.[0]?.similarity < top.similarity);
  await q("UPDATE care_document SET status='DRAFT' WHERE document_id=?", [X.dPhysio]);
  ok('MySQL is authoritative: a doc set back to DRAFT directly in MySQL vanishes from search though its chunks remain', (await chunks(X.dPhysio)) >= 1 && !ids(await srch({ filters: { patientId: F.p1 } })).includes(X.dPhysio));
  await q("UPDATE care_document SET status='APPROVED' WHERE document_id=?", [X.dPhysio]);

  r = await PA(`/api/documents/${X.dDraft}`, { status: 'APPROVED' });
  ok('document: DRAFT -> APPROVED ingests the saved text file and becomes searchable', r.status === 200 && r.data.ingestion.status === 'INGESTED' && ids(await srch({ filters: { patientId: F.p1 } })).includes(X.dDraft));
  ok('document: APPROVED -> APPROVED with new text re-ingests', (await PA(`/api/documents/${X.dNoText}`, { status: 'APPROVED', text: PHYSIO })).data?.ingestion?.status === 'INGESTED');
  r = await PA(`/api/documents/${X.dRamp}`, { status: 'ARCHIVED' });
  ok('document: ARCHIVED removes the chunks and the document leaves search', r.data?.ingestion?.status === 'REMOVED' && (await chunks(X.dRamp)) === 0 && !ids(await srch({ filters: { patientId: F.p1 } })).includes(X.dRamp));
  ok('document: ARCHIVED is terminal; unknown id -> 404', is(await PA(`/api/documents/${X.dRamp}`, { status: 'APPROVED' }), 409, 'INVALID_TRANSITION') && is(await PA('/api/documents/900000000', { status: 'ARCHIVED' }), 404));
  const sa = await q("SELECT details FROM audit_log WHERE user_id=? AND action='SEMANTIC_SEARCH'", [F.coord.id]);
  ok('audit: searches are logged, but the query text is not', sa.length >= 5 && sa.every((x) => !/steps|door|house|wheelchair/i.test(JSON.stringify(x.details))));
});

// =================================================================== 8. LOOKUPS, READINESS, AUDIT
await guarded('lookups', async () => {
  section('8. Lookups, readiness endpoint, audit coverage');
  let r = await call('GET', '/api/patients?q=Zebra');
  ok('patients: search by name fragment (DOB returned)', r.data?.patients?.length === 1 && r.data.patients[0].patientId === F.p1 && r.data.patients[0].DOB === '1950-03-14');
  ok('patients: search by id; limit; bad limit / unknown param -> 422', (await call('GET', `/api/patients?q=${F.p1}`)).data?.patients?.some((x) => x.patientId === F.p1)
    && (await call('GET', '/api/patients?limit=1')).data?.patients?.length === 1 && (await call('GET', '/api/patients?limit=0')).status === 422 && (await call('GET', '/api/patients?foo=1')).status === 422);
  ok('patients: a literal % in the search does not act as a wildcard', (await call('GET', '/api/patients?q=%25')).data?.patients?.every((x) => x.name.includes('%')));
  ok('facilities: lists test facilities with type', (await call('GET', '/api/facilities')).data?.facilities?.some((f) => f.facilityId === F.f2 && f.facilityType === 'REHAB'));
  r = await call('GET', `/api/admissions?patientId=${F.p1}`);
  ok('admissions: both of the patient\'s admissions, with facility name and assigned doctors', r.data?.admissions?.length === 2 && r.data.admissions[0].facilityName === 'ZZMT F1' && r.data.admissions.every((a) => a.doctors[0]?.name === 'ZZMT Dr A'));
  ok('admissions: missing patientId -> 422; unknown patient -> empty list', (await call('GET', '/api/admissions')).status === 422 && (await call('GET', '/api/admissions?patientId=900000000')).data?.admissions?.length === 0);
  r = await call('GET', `/api/transition-readiness/${F.p1}`);
  ok('readiness: patient, summary, both plans, recovery episodes', r.status === 200 && r.data.patient.name === 'ZZMT Zebra Patient' && r.data.plans.length === 2 && r.data.recoveryEpisodes.length >= 2 && r.data.summary.plans === 2);
  const p1 = r.data?.plans?.find((p) => p.dischargeId === X.plan1);
  ok('readiness: completed plan lists its fulfilled requirements, allocations and acknowledged handoff', p1?.readinessStatus === 'COMPLETED' && p1.requirements.length === 3 && p1.requirements.some((x) => x.allocations.length > 0) && p1.handoffs.at(-1)?.status === 'ACKNOWLEDGED');
  const p2 = (await call('GET', `/api/transition-readiness/${F.p2}`)).data?.plans?.find((p) => p.dischargeId === X.plan3);
  ok('readiness: a ready plan with a SENT handoff -> AWAITING_HANDOFF', p2?.readinessStatus === 'AWAITING_HANDOFF');
  ok('readiness: unknown patient -> 404', is(await call('GET', '/api/transition-readiness/900000000'), 404, 'PATIENT_NOT_FOUND'));
  const have = new Set((await q('SELECT DISTINCT action a FROM audit_log WHERE user_id=?', [F.coord.id])).map((x) => x.a));
  const need = ['LOGIN', 'DISCHARGE_PLAN_CREATED', 'DISCHARGE_PLAN_UPDATED', 'RESOURCE_ALLOCATED', 'ALLOCATION_COMPLETED', 'ALLOCATION_CANCELLED', 'REQUIREMENT_CREATED', 'REQUIREMENT_UPDATED',
    'RECOVERY_EPISODE_CREATED', 'HANDOFF_CREATED', 'HANDOFF_SENT', 'HANDOFF_ACKNOWLEDGED', 'HANDOFF_REJECTED', 'DOCUMENT_CREATED', 'DOCUMENT_INGESTED', 'DOCUMENT_STATUS_CHANGED', 'SEMANTIC_SEARCH'];
  ok('audit: every state-changing action left a row for the acting user', need.every((a) => have.has(a)), need.filter((a) => !have.has(a)).join(','));
  ok('audit: failed logins are recorded', (await q("SELECT COUNT(*) n FROM audit_log WHERE user_id=? AND action='LOGIN_FAILED'", [F.coord.id]))[0].n >= 1);
  ok('audit: rows carry entity type, entity id and a timestamp', (await q("SELECT COUNT(*) n FROM audit_log WHERE user_id=? AND (entity_type='' OR entity_id='' OR `timestamp` IS NULL)", [F.coord.id]))[0].n === 0);
});

// =================================================================== 9. EXTERNAL API
await guarded('external', async () => {
  section('9. External transition API');
  const dest = mkClient('dest', F.f2), origin = mkClient('origin', F.f1), other = mkClient('other', F.f3), rev = mkClient('rev', F.f2), thr = mkClient('thr', F.f2);
  ok('client:create CLI issues 5 tokens', [dest, origin, other, rev, thr].every(Boolean));
  if (![dest, origin, other, rev, thr].every(Boolean)) return;
  const secret = crypto.randomBytes(32).toString('base64url');
  const nofac = await ins("INSERT INTO api_client (client_name,client_type,credential_hash,status,created_at) VALUES ('ZZMT nofac','TEST',?, 'ACTIVE', NOW())", [crypto.createHash('sha256').update(secret).digest('hex')]);
  const stored = (await q('SELECT credential_hash h FROM api_client WHERE client_id=?', [dest.id]))[0].h;
  ok('credential stored only as a hash (never the secret)', stored.length === 64 && !dest.token.includes(stored) && !stored.includes(dest.token.split('_')[2]));
  const fake = (id) => `coc_${id}_${'A'.repeat(43)}`;
  const noHdr = await ext('GET', '/api/external/transitions');
  ok('no Authorization header -> 401', is(noHdr, 401, 'UNAUTHENTICATED'));
  ok('malformed token -> 401', (await ext('GET', '/api/external/transitions', 'not-a-token')).status === 401);
  ok('wrong secret -> 401, same message as a missing header', (await ext('GET', '/api/external/transitions', fake(dest.id))).msg === noHdr.msg);
  ok('unknown client id -> 401', (await ext('GET', '/api/external/transitions', fake(900000000))).status === 401);
  ok('client with no facility scope -> 403 NO_FACILITY_SCOPE', is(await ext('GET', '/api/external/transitions', `coc_${nofac}_${secret}`), 403, 'NO_FACILITY_SCOPE'));
  ok('a browser session cookie does not authenticate here', (await ext('GET', '/api/external/transitions', null, { cookie: S })).status === 401);
  ok('failed attempts against a real client are audited', (await q("SELECT COUNT(*) n FROM audit_log WHERE client_id=? AND action='API_AUTH_FAILED'", [dest.id]))[0].n >= 1);

  const codes = []; for (let i = 0; i < 11; i++) codes.push((await ext('GET', '/api/external/transitions', fake(thr.id))).status);
  ok('throttling: 10 failures -> 401, 11th -> 429', codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429, `(${codes})`);
  ok('throttling: the correct token is refused while throttled', (await ext('GET', '/api/external/transitions', thr.token)).status === 429);
  ok('revoke CLI: token works, then 401 after revocation (correct secret)', (await ext('GET', '/api/external/transitions', rev.token)).status === 200
    && (execFileSync('node', ['scripts/create-api-client.mjs', '--revoke', String(rev.id)], { cwd: ROOT }), (await ext('GET', '/api/external/transitions', rev.token)).status === 401));

  let r = await ext('GET', '/api/external/transitions?limit=100', dest.token); const list = r.data?.transitions ?? [];
  ok('list: receiving client sees all three destination-f2 plans', r.status === 200 && [X.plan1, X.plan2, X.plan3].every((d) => list.some((t) => t.dischargeId === d)));
  ok('list: summaries carry state but no patient name', list[0] && !('patientName' in list[0]) && list.find((t) => t.dischargeId === X.plan3).handoffStatus === 'SENT');
  ok('list: unrelated client sees none of them', !(await ext('GET', '/api/external/transitions?limit=100', other.token)).data.transitions.some((t) => [X.plan1, X.plan2, X.plan3].includes(t.dischargeId)));
  ok('list: handoffStatus filter; unknown parameter -> 422', (await ext('GET', '/api/external/transitions?handoffStatus=ACKNOWLEDGED&limit=100', dest.token)).data.transitions.every((t) => t.handoffStatus === 'ACKNOWLEDGED') && (await ext('GET', '/api/external/transitions?foo=1', dest.token)).status === 422);
  r = await ext('GET', `/api/external/transitions/${X.plan1}`, dest.token); const p = r.data;
  ok('payload: schema version, patient (name, date of birth), admission, discharge', r.status === 200 && p.schemaVersion === '1.0' && p.patient.name === 'ZZMT Zebra Patient' && p.patient.dateOfBirth === '1950-03-14' && p.admission.facilityId === F.f1 && p.discharge.destinationFacilityId === F.f2 && p.discharge.status === 'COMPLETED');
  ok('payload: readiness counts, requirements without cancelled ones, allocation state, handoff state', p.readiness.fulfilledRequirements === 3 && p.readiness.outstandingRequirements === 0 && p.requirements.length === 3
    && p.requirements.some((x) => x.allocations.some((a) => a.allocationStatus === 'COMPLETED')) && p.handoff.status === 'ACKNOWLEDGED' && p.handoffs.length === 1);
  ok('payload: the sending facility may read it too', (await ext('GET', `/api/external/transitions/${X.plan1}`, origin.token)).status === 200);
  ok('payload: unrelated client and unknown plan both -> 404 TRANSITION_NOT_FOUND', is(await ext('GET', `/api/external/transitions/${X.plan1}`, other.token), 404, 'TRANSITION_NOT_FOUND') && is(await ext('GET', '/api/external/transitions/900000000', dest.token), 404, 'TRANSITION_NOT_FOUND'));
  ok('payload: non-numeric id -> 400', (await ext('GET', '/api/external/transitions/abc', dest.token)).status === 400);
  ok('handoff status: receiver sees it; unrelated client -> 404', (await ext('GET', `/api/external/handoffs/${X.h3}`, dest.token)).data?.handoff?.toFacilityName === 'ZZMT F2' && (await ext('GET', `/api/external/handoffs/${X.h3}`, other.token)).status === 404);
  const counts = {}; for (const a of ['API_LIST_TRANSITIONS', 'API_GET_TRANSITION', 'API_GET_HANDOFF']) counts[a] = (await q('SELECT COUNT(*) n FROM audit_log WHERE client_id=? AND user_id IS NULL AND action=?', [dest.id, a]))[0].n;
  ok('reads are audited with the client id (per call type)', Object.values(counts).every((n) => n >= 1), JSON.stringify(counts));

  ok('acknowledge: sending facility -> 403 NOT_RECEIVING_FACILITY', is(await ext('POST', `/api/external/handoffs/${X.h3}/acknowledge`, origin.token), 403, 'NOT_RECEIVING_FACILITY'));
  ok('acknowledge: unrelated client -> 404', (await ext('POST', `/api/external/handoffs/${X.h3}/acknowledge`, other.token)).status === 404);
  ok('acknowledge: refused attempts changed nothing', (await q('SELECT status s FROM care_handoff WHERE handoff_id=?', [X.h3]))[0].s === 'SENT');
  r = await ext('POST', `/api/external/handoffs/${X.h3}/acknowledge`, dest.token);
  ok('acknowledge: receiving facility succeeds (no body needed); timestamp set', r.status === 200 && r.data.handoff.status === 'ACKNOWLEDGED' && r.data.handoff.acknowledgedAt);
  const au = (await q("SELECT user_id u, client_id c FROM audit_log WHERE action='HANDOFF_ACKNOWLEDGED' AND entity_id=?", [String(X.h3)]))[0];
  ok('acknowledge: audit row names the API client, not a user', au && au.c === dest.id && au.u === null);
  ok('acknowledge: second attempt -> 409 INVALID_TRANSITION', is(await ext('POST', `/api/external/handoffs/${X.h3}/acknowledge`, dest.token), 409, 'INVALID_TRANSITION'));
  ok('reject: receiving facility rejects a SENT handoff', (await ext('POST', `/api/external/handoffs/${X.h2b}/reject`, dest.token)).data?.handoff?.status === 'REJECTED');
  ok('acknowledged handoff is visible on the UI-side API too', (await call('GET', `/api/handoffs/${X.h3}`)).data?.handoff?.status === 'ACKNOWLEDGED');
  ok('external clients cannot create handoffs (no such endpoint)', [404, 405].includes((await ext('POST', '/api/external/handoffs', dest.token)).status));
  ok('unknown handoff -> 404', (await ext('POST', '/api/external/handoffs/900000000/acknowledge', dest.token)).status === 404);
});

// =================================================================== 10. UI
await guarded('ui', async () => {
  section('10. User interface');
  const pages = ['/login', '/', '/dashboard', '/discharge-plans/new', `/discharge-plans/${X.plan1 ?? 1}`, '/resources', '/allocations', '/recovery', '/handoffs', '/documents', '/search'];
  for (const p of pages) {
    const res = await fetch(BASE + p); const html = await res.text();
    ok(`page ${p} renders (200 HTML, no application error)`, res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html') && !html.includes('Application error'));
  }
  const html = await (await fetch(BASE + '/login')).text();
  ok('/login shows the sign-in form', html.includes('Sign in') && html.includes('type="password"'));
  const css = html.match(/\/_next\/static\/[^"']+\.css[^"']*/)?.[0];
  ok('/login links a compiled stylesheet', Boolean(css));
  if (css) {
    const t = await (await fetch(BASE + css.replace(/&amp;/g, '&'))).text();
    const has = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t);
    ok('theme: colour tokens (primary #004AAD, accent #0066FF, navy #0A1930)', has('--primary-blue') && has('#004AAD') && has('#0066FF') && has('#0A1930'));
    ok('theme: glass navbar, pill buttons, gradients', has('backdrop-filter') && has('border-radius: 50px') && has('linear-gradient(135deg'));
    ok('theme: animations (morph, float, fade-in) and reduced-motion respect', has('@keyframes morph') && has('@keyframes float') && has('.fade-in') && has('prefers-reduced-motion'));
    ok('theme: responsive breakpoints and mobile menu', has('max-width: 1024px') && has('max-width: 768px') && has('.hamburger'));
  }
  ok('the page route does not expose the databases (no direct DB access from the browser)', !html.includes(process.env.MYSQL_PASSWORD ?? '@@none@@') || process.env.MYSQL_PASSWORD === undefined);
});

// =================================================================== 11. CLI + HYGIENE
await guarded('cli', async () => {
  section('11. CLI scripts, migrations, repository hygiene');
  const run = (args) => { try { return { code: 0, out: execFileSync(args[0], args.slice(1), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
  let m = run(['npm', 'run', '--silent', 'db:mysql:migrate']);
  ok('MySQL migrations: exit 0 and idempotent (nothing newly applied)', m.code === 0 && !/^applied/m.test(m.out), m.code ? m.out.slice(0, 120) : '');
  m = run(['npm', 'run', '--silent', 'db:pg:migrate']);
  ok('PostgreSQL migrations: exit 0 and idempotent', m.code === 0 && !/^applied/m.test(m.out), m.code ? m.out.slice(0, 120) : '');
  const mkDoc = async (title, status) => ins("INSERT INTO care_document (patient_id,document_type,title,source,created_by,status) VALUES (?, 'ZZMT_CLI',?, 'cli', ?, ?)", [F.p3, title, F.coord.id, status]);
  fs.mkdirSync(DOCDIR, { recursive: true });
  const dOk = await mkDoc('ZZMT cli approved', 'APPROVED'), dDr = await mkDoc('ZZMT cli draft', 'DRAFT');
  fs.writeFileSync(path.join(DOCDIR, `${dOk}.txt`), 'The rehabilitation centre will provide physiotherapy twice a week for six weeks. Falls prevention is a priority at home.');
  fs.writeFileSync(path.join(DOCDIR, `${dDr}.txt`), 'Draft text that must not be ingested.');
  m = run(['npm', 'run', '--silent', 'ingest', '--', String(dOk)]);
  ok('ingest CLI: approved document is chunked and stored in PostgreSQL', m.code === 0 && (await pgp.query('SELECT count(*)::int n FROM care_document_chunk WHERE document_id=$1', [dOk])).rows[0].n >= 1, m.code ? m.out.slice(0, 120) : '');
  m = run(['npm', 'run', '--silent', 'ingest', '--', String(dDr)]);
  ok('ingest CLI: DRAFT document refused (non-zero exit, no chunks)', m.code !== 0 && (await pgp.query('SELECT count(*)::int n FROM care_document_chunk WHERE document_id=$1', [dDr])).rows[0].n === 0);
  m = run(['npm', 'run', '--silent', 'search', '--', '--user', F.coord.email, '--patient', String(F.p3), 'preventing falls at home']);
  ok('search CLI: finds the ingested document', m.code === 0 && m.out.includes('ZZMT cli approved'), m.code ? m.out.slice(0, 120) : '');
  m = run(['npm', 'run', '--silent', 'search', '--', '--user', F.norole.email, 'falls']);
  ok('search CLI: a user without a permitted role is refused', m.code !== 0 && /USER_NOT_ALLOWED/.test(m.out));
  m = run(['npm', 'run', '--silent', 'client:create', '--', '--name', 'ZZMT bad', '--facility', '900000000']);
  ok('client:create CLI: unknown facility fails and creates nothing', m.code !== 0 && (await q("SELECT COUNT(*) n FROM api_client WHERE client_name='ZZMT bad'"))[0].n === 0);

  const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
  ok('.gitignore excludes .env, node_modules, .next, model cache, document text', ['.env', 'node_modules/', '.next/', '.cache/', 'data/documents/'].every((s) => gi.includes(s)));
  ok('.env.example exists and contains no real secret placeholders missing', fs.existsSync(path.join(ROOT, '.env.example')));
  const tracked = run(['git', 'ls-files', '.env']); ok('.env is not tracked by git', tracked.code !== 0 || tracked.out.trim() === '');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('package.json has the requirements and scripts (dependencies, dev/build/start, migrate, ingest, search)', ['next', 'react', 'mysql2', 'pg', 'bcryptjs', 'jose', 'zod', '@xenova/transformers', 'dotenv'].every((d) => pkg.dependencies?.[d])
    && ['dev', 'build', 'start', 'db:mysql:migrate', 'db:pg:migrate', 'ingest', 'search', 'client:create'].every((s) => pkg.scripts?.[s]));
  ok('external API document exists', fs.existsSync(path.join(ROOT, 'docs', 'external-api.md')));
});

// =================================================================== SUMMARY
await cleanup();
await multi.end(); await my.end(); await pgp.end();
console.log(`\n${'='.repeat(60)}\nRESULT: ${nPass} passed, ${nFail} failed`);
if (nFail) { console.log('Failed checks:'); failed.forEach((f) => console.log(`  - ${f}`)); }
console.log(nFail ? '\nMASTER VERIFICATION FAILED.' : '\nPASS: the entire system is verified end to end.');
process.exit(nFail ? 1 : 0);