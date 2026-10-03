import { semanticSearch } from '../lib/semantic-search.mjs';
import { getMysqlPool, closeMysql } from '../lib/db-mysql.mjs';
import { closePg } from '../lib/db-pg.mjs';

const args = process.argv.slice(2);
const opt = {};
const words = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else words.push(args[i]);
}
if (!opt.user || !words.length) {
  console.error('Usage: node scripts/search-documents.mjs --user <email> [--patient N] [--admission N] [--recovery N] [--type T] [--limit N] <query>');
  process.exit(2);
}

let code = 0;
try {
  const [rows] = await getMysqlPool().execute('SELECT user_id FROM app_user WHERE email = ?', [opt.user]);
  if (!rows.length) throw new Error(`No user with email ${opt.user}`);
  const out = await semanticSearch({
    userId: rows[0].user_id,
    query: words.join(' '),
    filters: { patientId: opt.patient, admissionId: opt.admission, recoveryId: opt.recovery, documentType: opt.type },
    limit: opt.limit ? Number(opt.limit) : 10,
  });
  console.log(`query: "${out.query}"  (${out.count} result(s))\n`);
  out.results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.similarity.toFixed(3)}] ${r.document.title}  (doc ${r.documentId}, chunk ${r.chunkId}, #${r.chunkIndex}, ${r.document.documentType})`);
    console.log(`   ${r.content.replace(/\s+/g, ' ').slice(0, 160)}...\n`);
  });
} catch (e) {
  console.error(`${e.code ?? e.name}: ${e.message}`);
  code = 1;
} finally {
  await closeMysql();
  await closePg();
}
process.exit(code);