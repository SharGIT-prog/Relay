import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMysqlPool } from './db-mysql.mjs';

const root = process.cwd();
export const DOCUMENT_TEXT_DIR = path.join(root, 'data', 'documents');

export class IngestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
  }
}

const COLUMNS = `document_id, patient_id, admission_id, recovery_id,
                 document_type, title, source, status, created_at`;

export async function getApprovedDocument(documentId, db = getMysqlPool()) {
  const id = Number(documentId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new IngestError('INVALID_DOCUMENT_ID', `Invalid document id: ${documentId}`);
  }
  const [rows] = await db.execute(`SELECT ${COLUMNS} FROM care_document WHERE document_id = ?`, [id]);
  if (!rows.length) throw new IngestError('DOCUMENT_NOT_FOUND', `Document ${id} not found`);
  if (rows[0].status !== 'APPROVED') {
    throw new IngestError('DOCUMENT_NOT_APPROVED', `Document ${id} has status ${rows[0].status}; only APPROVED documents are ingested`);
  }
  return rows[0];
}

export async function listApprovedDocuments(db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT ${COLUMNS} FROM care_document WHERE status = 'APPROVED' ORDER BY document_id`
  );
  return rows;
}

export async function readDocumentText(documentId, dir = DOCUMENT_TEXT_DIR) {
  const file = path.join(dir, `${Number(documentId)}.txt`);
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new IngestError('TEXT_NOT_FOUND', `No text file for document ${documentId}: ${file}`);
    throw e;
  }
  if (!text.trim()) throw new IngestError('EMPTY_TEXT', `Text file for document ${documentId} is empty`);
  return text;
}