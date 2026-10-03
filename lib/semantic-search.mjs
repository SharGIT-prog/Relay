import { rankChunks } from './search.mjs';
import { resolveSearchUser, getAuthorizedDocuments } from './search-authorization.mjs';

/**
 * @param userId   authenticated user's id
 * @param filters  { patientId, admissionId, recoveryId, documentType }
 * @returns { query, count, results: [{ documentId, chunkId, chunkIndex, content, metadata, similarity, document }] }
 */
export async function semanticSearch({ userId, query, filters = {}, limit = 10, minSimilarity = null }, deps = {}) {
  const user = await resolveSearchUser(userId, deps.mysqlDb);
  const docs = await getAuthorizedDocuments(user, filters, deps.mysqlDb);
  const byId = new Map(docs.map((d) => [Number(d.document_id), d]));

  const ranked = await rankChunks(
    { query, documentIds: [...byId.keys()], limit, minSimilarity },
    deps.pgPool
  );

  const results = ranked
    .filter((r) => byId.has(r.documentId)) 
    .map((r) => {
      const d = byId.get(r.documentId);
      const document = {
        documentId: d.document_id, patientId: d.patient_id, patientName: d.patient_name,
        admissionId: d.admission_id, recoveryId: d.recovery_id, documentType: d.document_type,
        title: d.title, source: d.source, status: d.status, createdAt: d.created_at,
      };
      return {
        documentId: r.documentId,
        chunkId: r.chunkId,
        chunkIndex: r.chunkIndex,
        content: r.content,
        // the chunk's stored JSON + MySQL's curr. values for belonging to MySQL
        metadata: {
          ...r.metadata,
          patient_id: d.patient_id, admission_id: d.admission_id, recovery_id: d.recovery_id,
          document_type: d.document_type, title: d.title, source: d.source, status: d.status,
        },
        similarity: r.similarity,
        document,
      };
    });
  return { query, count: results.length, results };
}