import { getMysqlPool } from './db-mysql.mjs';
import { getPgPool } from './db-pg.mjs';
import { chunkText } from './chunker.mjs';
import {
  embedTexts, assertModelRegistered, toVectorLiteral, EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION,
} from './embedding.mjs';
import { getApprovedDocument, readDocumentText, IngestError } from './document-source.mjs';

export function buildChunkMetadata(doc, chunkCount) {
  return {
    document_id: doc.document_id,
    patient_id: doc.patient_id,
    admission_id: doc.admission_id,
    recovery_id: doc.recovery_id,
    document_type: doc.document_type,
    source: doc.source,
    title: doc.title,
    status: doc.status,
    chunk_count: chunkCount,
    embedding_model: EMBEDDING_MODEL,
    embedding_model_version: EMBEDDING_MODEL_VERSION,
  };
}

/**
 * @param documentId  
 * @param options.text          
 * @param options.chunkOptions  { maxChars, overlapChars }
 * @returns { documentId, chunks, model, version }
 */
export async function ingestDocument(
  documentId,
  { text, chunkOptions, mysqlDb = getMysqlPool(), pgPool = getPgPool() } = {}
) {
  const doc = await getApprovedDocument(documentId, mysqlDb);
  const raw = text ?? (await readDocumentText(doc.document_id));
  const chunks = chunkText(raw, chunkOptions);
  if (!chunks.length) throw new IngestError('EMPTY_TEXT', `Document ${doc.document_id} has no text to ingest`);

  const vectors = (await embedTexts(chunks)).map(toVectorLiteral);
  const metadata = JSON.stringify(buildChunkMetadata(doc, chunks.length));
  const indexes = chunks.map((_, i) => i);

  const client = await pgPool.connect();
  try {
    await assertModelRegistered(client);
    await client.query('BEGIN');
    await client.query('DELETE FROM care_document_chunk WHERE document_id = $1', [doc.document_id]);
    await client.query(
      `INSERT INTO care_document_chunk (document_id, chunk_index, content, embedding, metadata)
       SELECT $1::bigint, t.idx, t.content, t.emb::vector, $2::jsonb
       FROM unnest($3::int[], $4::text[], $5::text[]) AS t(idx, content, emb)`,
      [doc.document_id, metadata, indexes, chunks, vectors]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { documentId: doc.document_id, chunks: chunks.length, model: EMBEDDING_MODEL, version: EMBEDDING_MODEL_VERSION };
}

/** Removes document's chunks */
export async function deleteDocumentChunks(documentId, pgPool = getPgPool()) {
  const res = await pgPool.query('DELETE FROM care_document_chunk WHERE document_id = $1', [documentId]);
  return res.rowCount;
}

export async function listIngestedDocumentIds(pgPool = getPgPool()) {
  const { rows } = await pgPool.query('SELECT DISTINCT document_id FROM care_document_chunk');
  return new Set(rows.map((r) => Number(r.document_id)));
}