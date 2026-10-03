import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createHandoffSchema } from '@/lib/schemas.mjs';
import { createHandoff, getHandoffDetail } from '@/lib/handoff-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(createHandoffSchema, await readJson(request));
  const id = await createHandoff(input, actor);
  return ok({ handoff: await getHandoffDetail(id) }, 201);
});