import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { semanticSearchSchema } from '@/lib/schemas.mjs';
import { semanticSearch } from '@/lib/semantic-search.mjs';
import { writeAudit } from '@/lib/audit.mjs';
import { getMysqlPool } from '@/lib/db-mysql.mjs';

// MySQL decides which documents caller may search; PostgreSQL ranks
export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(semanticSearchSchema, await readJson(request));
  const out = await semanticSearch({
    userId: actor.userId, query: input.query, filters: input.filters,
    limit: input.limit, minSimilarity: input.minSimilarity ?? null,
  });
  // Query text not logged (may contain patient info)
  await writeAudit(getMysqlPool(), {
    userId: actor.userId, action: 'SEMANTIC_SEARCH', entityType: 'CARE_DOCUMENT_CHUNK', entityId: 'search',
    details: { filters: input.filters, limit: input.limit, resultCount: out.count, documentIds: [...new Set(out.results.map((r) => r.documentId))] },
  }).catch((e) => console.error('AUDIT FAILURE (semantic search):', e));
  return ok(out);
});