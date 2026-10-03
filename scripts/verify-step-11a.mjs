import { embedTexts, EMBEDDING_DIMENSION, assertModelRegistered, toVectorLiteral } from '../lib/embedding.mjs';
import { getPgPool, closePg } from '../lib/db-pg.mjs';

let failed = false;
const check = (label, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`);
  if (!pass) failed = true;
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

try {
  console.log('Loading model (first run downloads about 23 MB)...');
  const [a, b, c] = await embedTexts([
    'The patient needs a wheelchair ramp at the front door.',
    'Step-free entry must be arranged for a mobility device.',
    'The quarterly budget report is overdue.',
  ]);
  check(`vectors have ${EMBEDDING_DIMENSION} dimensions`, a.length === EMBEDDING_DIMENSION && c.length === EMBEDDING_DIMENSION);
  const norm = Math.sqrt(dot(a, a));
  check('vectors are L2-normalised', Math.abs(norm - 1) < 1e-3, `(norm ${norm.toFixed(5)})`);
  check('similar sentences are closer than unrelated ones', dot(a, b) > dot(a, c) + 0.1,
    `(similar ${dot(a, b).toFixed(3)}, unrelated ${dot(a, c).toFixed(3)})`);

  const pool = getPgPool();
  await assertModelRegistered(pool);
  await assertModelRegistered(pool);
  check('model registered; second call is idempotent and column is vector(384)', true);

  const { rows: [r] } = await pool.query('SELECT $1::vector <=> $2::vector AS d', [toVectorLiteral(a), toVectorLiteral(b)]);
  check('pgvector cosine distance equals 1 - dot product', Math.abs(Number(r.d) - (1 - dot(a, b))) < 1e-4,
    `(pg ${Number(r.d).toFixed(5)}, js ${(1 - dot(a, b)).toFixed(5)})`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE embedding_model_info SET dimension = 1');
    let threw = false;
    try { await assertModelRegistered(client); } catch { threw = true; }
    check('a different registered model/dimension is refused', threw);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
} finally {
  await closePg();
}
console.log(failed ? '\nStep 11a verification FAILED.' : '\nPASS: Step 11a (embedding model + registry) verified.');
process.exit(failed ? 1 : 0);