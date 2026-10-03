import { ingestDocument, listIngestedDocumentIds } from '../lib/ingest.mjs';
import { listApprovedDocuments } from '../lib/document-source.mjs';
import { closeMysql } from '../lib/db-mysql.mjs';
import { closePg } from '../lib/db-pg.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));

if (!all && ids.length === 0) {
  console.error('Usage: node scripts/ingest-documents.mjs <document_id>... | --all [--force]');
  process.exit(2);
}

let failures = 0;
try {
  let targets = ids;
  if (all) {
    const approved = (await listApprovedDocuments()).map((d) => d.document_id);
    const done = force ? new Set() : await listIngestedDocumentIds();
    targets = approved.filter((id) => !done.has(id));
    if (!targets.length) console.log('Nothing to ingest (use --force to re-ingest).');
  }
  for (const id of targets) {
    try {
      const r = await ingestDocument(id);
      console.log(`ingested document ${r.documentId}: ${r.chunks} chunk(s)  [${r.model}]`);
    } catch (e) {
      failures++;
      console.error(`FAILED   document ${id}: ${e.code ?? e.name}: ${e.message}`);
    }
  }
} finally {
  await closeMysql();
  await closePg();
}
process.exit(failures ? 1 : 0);