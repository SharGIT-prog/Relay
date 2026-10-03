import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { patchDocumentSchema } from '@/lib/schemas.mjs';
import { getDocument, updateDocumentStatus } from '@/lib/document-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  return ok({ document: await getDocument(parseIdParam((await ctx.params).id)) });
});

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  const input = parseBody(patchDocumentSchema, await readJson(request));
  return ok(await updateDocumentStatus(id, input, actor));
});