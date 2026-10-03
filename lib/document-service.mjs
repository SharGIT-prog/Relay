import fs from 'node:fs/promises';
import path from 'node:path';
import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { getPgPool } from './db-pg.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';
import { ingestDocument, deleteDocumentChunks } from './ingest.mjs';
import { DOCUMENT_TEXT_DIR } from './document-source.mjs';

const COLS = `d.document_id, d.patient_id, p.name AS patient_name, d.admission_id, d.recovery_id,
              d.document_type, d.title, d.source, d.status, d.created_by, d.created_at`;

async function chunkCounts(ids) {
  if (!ids.length) return new Map();
  const { rows } = await getPgPool().query(
    'SELECT document_id, count(*)::int AS n FROM care_document_chunk WHERE document_id = ANY($1::bigint[]) GROUP BY document_id', [ids]);
  return new Map(rows.map((r) => [Number(r.document_id), r.n]));
}

export async function getDocument(id) {
  const [rows] = await getMysqlPool().execute(
    `SELECT ${COLS} FROM care_document d JOIN patient p ON p.patient_id = d.patient_id WHERE d.document_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  return { ...rows[0], chunk_count: (await chunkCounts([id])).get(id) ?? 0 };
}

export async function listDocuments(q) {
  let sql = `SELECT ${COLS} FROM care_document d JOIN patient p ON p.patient_id = d.patient_id WHERE 1 = 1`;
  const p = [];
  if (q.patientId !== undefined)    { sql += ' AND d.patient_id = ?';    p.push(q.patientId); }
  if (q.status !== undefined)       { sql += ' AND d.status = ?';        p.push(q.status); }
  if (q.documentType !== undefined) { sql += ' AND d.document_type = ?'; p.push(q.documentType); }
  sql += ' ORDER BY d.document_id DESC LIMIT ? OFFSET ?';
  p.push(q.limit, q.offset);
  const [rows] = await getMysqlPool().query(sql, p);
  const counts = await chunkCounts(rows.map((r) => Number(r.document_id)));
  return rows.map((r) => ({ ...r, chunk_count: counts.get(Number(r.document_id)) ?? 0 }));
}

async function saveText(id, text) {
  await fs.mkdir(DOCUMENT_TEXT_DIR, { recursive: true });
  await fs.writeFile(path.join(DOCUMENT_TEXT_DIR, `${id}.txt`), text);
}

async function runIngestion(id, actor) {
  let outcome;
  try {
    const r = await ingestDocument(id);
    outcome = { status: 'INGESTED', chunks: r.chunks };
  } catch (e) {
    const known = e?.name === 'IngestError';
    if (!known) console.error(`Ingestion of document ${id} failed:`, e);
    outcome = { status: 'FAILED', code: known ? e.code : 'INGESTION_ERROR',
                message: known ? e.message : 'Ingestion failed; see the server log' };
  }
  await writeAudit(getMysqlPool(), {
    userId: actor.userId, entityType: 'CARE_DOCUMENT', entityId: id,
    action: outcome.status === 'INGESTED' ? 'DOCUMENT_INGESTED' : 'DOCUMENT_INGESTION_FAILED',
    details: outcome.status === 'INGESTED' ? { chunks: outcome.chunks } : { code: outcome.code },
  }).catch((e) => console.error('AUDIT FAILURE (document ingestion):', e));
  return outcome;
}

export async function createDocument(input, actor) {
  const id = await withTransaction(async (conn) => {
    const [p] = await conn.execute('SELECT 1 FROM patient WHERE patient_id = ?', [input.patientId]);
    if (!p.length) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Patient not found');
    if (input.admissionId != null) {
      const [a] = await conn.execute('SELECT patient_id FROM admission WHERE admission_id = ?', [input.admissionId]);
      if (!a.length) throw new ApiError(404, 'ADMISSION_NOT_FOUND', 'Admission not found');
      if (a[0].patient_id !== input.patientId) throw new ApiError(422, 'ADMISSION_PATIENT_MISMATCH', 'The admission belongs to a different patient');
    }
    if (input.recoveryId != null) {
      const [r] = await conn.execute('SELECT patient_id FROM recovery_episode WHERE recovery_id = ?', [input.recoveryId]);
      if (!r.length) throw new ApiError(404, 'RECOVERY_NOT_FOUND', 'Recovery episode not found');
      if (r[0].patient_id !== input.patientId) throw new ApiError(422, 'RECOVERY_PATIENT_MISMATCH', 'The recovery episode belongs to a different patient');
    }
    const [res] = await conn.execute(
      `INSERT INTO care_document (patient_id, admission_id, recovery_id, document_type, title, source, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.patientId, input.admissionId ?? null, input.recoveryId ?? null, input.documentType,
       input.title, input.source, actor.userId, input.status]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'DOCUMENT_CREATED', entityType: 'CARE_DOCUMENT', entityId: res.insertId,
      details: { patientId: input.patientId, documentType: input.documentType, status: input.status },
    });
    return res.insertId;
  });

  let ingestion = { status: 'SKIPPED' };
  try {
    if (input.text?.trim()) await saveText(id, input.text);
    if (input.status === 'APPROVED') ingestion = await runIngestion(id, actor);
  } catch (e) {
    console.error(`Saving text for document ${id} failed:`, e);
    ingestion = { status: 'FAILED', code: 'TEXT_SAVE_FAILED', message: 'The document text could not be saved' };
  }
  return { document: await getDocument(id), ingestion };
}

const DOC_TRANSITIONS = {
  DRAFT: ['APPROVED', 'ARCHIVED'],
  APPROVED: ['APPROVED', 'DRAFT', 'ARCHIVED'], // APPROVED -> APPROVED = re-ingest
  ARCHIVED: [],
};

export async function updateDocumentStatus(id, { status, text }, actor) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT status FROM care_document WHERE document_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    const cur = rows[0].status;
    if (!DOC_TRANSITIONS[cur].includes(status)) {
      throw new ApiError(409, 'INVALID_TRANSITION', `Cannot change a ${cur} document to ${status}`);
    }
    if (status !== cur) {
      await conn.execute('UPDATE care_document SET status = ? WHERE document_id = ?', [status, id]);
      await writeAudit(conn, {
        userId: actor.userId, action: 'DOCUMENT_STATUS_CHANGED', entityType: 'CARE_DOCUMENT', entityId: id,
        details: { from: cur, to: status },
      });
    }
  });

  // After commit
  let ingestion;
  if (text?.trim()) await saveText(id, text);
  if (status === 'APPROVED') ingestion = await runIngestion(id, actor);
  else {
    await deleteDocumentChunks(id);
    ingestion = { status: 'REMOVED' };
  }
  return { document: await getDocument(id), ingestion };
}