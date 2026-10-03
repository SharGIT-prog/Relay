import { route, ok, readJson, parseBody, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createDocumentSchema, documentsQuerySchema } from '@/lib/schemas.mjs';
import { createDocument, listDocuments } from '@/lib/document-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);
  const q = parseQuery(documentsQuerySchema, request);
  return ok({ documents: await listDocuments(q), limit: q.limit, offset: q.offset });
});

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(createDocumentSchema, await readJson(request));
  return ok(await createDocument(input, actor), 201);
});