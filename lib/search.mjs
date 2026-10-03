import { getPgPool } from './db-pg.mjs';
import { embedText, toVectorLiteral, assertModelRegistered } from './embedding.mjs';

export const MAX_LIMIT = 50;
export const MAX_QUERY_CHARS = 2000;

export class SearchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SearchError';
    this.code = code; // INVALID_QUERY | INVALID_LIMIT | INVALID_FILTER | USER_NOT_ALLOWED
  }
}

/**
 * @param query          
 * @param documentIds    
 * @param limit          
 * @param minSimilarity  
 * @param efSearch       
 * @returns [{ chunkId, documentId, chunkIndex, content, metadata, distance, similarity }]
 */
export async function rankChunks(
  { query, documentIds, limit = 10, minSimilarity = null, efSearch = 100 },
  pgPool = getPgPool()
) {
  if (typeof query !== 'string' || !query.trim()) throw new SearchError('INVALID_QUERY', 'Query must be a non-empty string');
  if (query.length > MAX_QUERY_CHARS) throw new SearchError('INVALID_QUERY', `Query is longer than ${MAX_QUERY_CHARS} characters`);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new SearchError('INVALID_LIMIT', `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (minSimilarity !== null && !(minSimilarity >= -1 && minSimilarity <= 1)) {
    throw new SearchError('INVALID_FILTER', 'minSimilarity must be a number between -1 and 1');
  }
  if (!Array.isArray(documentIds) || documentIds.some((d) => !Number.isSafeInteger(d))) {
    throw new TypeError('documentIds must be an array of integers');
  }
  if (documentIds.length === 0) return [];

  const vector = toVectorLiteral(await embedText(query.trim()));
  const ef = Math.min(1000, Math.max(limit, efSearch));

  const client = await pgPool.connect();
  try {
    await assertModelRegistered(client); // writes on first use - runs before the read-only transaction
    await client.query('BEGIN READ ONLY');
    await client.query(`SELECT set_config('hnsw.ef_search', $1, true), set_config('hnsw.iterative_scan', 'relaxed_order', true)`, [String(ef)]);
    const { rows } = await client.query(
      `WITH candidates AS MATERIALIZED (
         SELECT chunk_id, document_id, chunk_index, content, metadata,
                embedding <=> $1::vector AS distance
         FROM care_document_chunk
         WHERE document_id = ANY($2::bigint[])
         ORDER BY embedding <=> $1::vector
         LIMIT $3
       )
       SELECT chunk_id, document_id, chunk_index, content, metadata, distance
       FROM candidates
       ORDER BY distance, chunk_id`,
      [vector, documentIds, limit]
    );
    await client.query('COMMIT');
    const results = rows.map((r) => ({
      chunkId: Number(r.chunk_id),
      documentId: Number(r.document_id),
      chunkIndex: r.chunk_index,
      content: r.content,
      metadata: r.metadata,
      distance: Number(r.distance),
      similarity: 1 - Number(r.distance),
    }));
    return minSimilarity === null ? results : results.filter((r) => r.similarity >= minSimilarity);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}