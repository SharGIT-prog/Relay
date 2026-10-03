import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { allocateResourceSchema } from '@/lib/schemas.mjs';
import { allocateResource } from '@/lib/allocation-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(allocateResourceSchema, await readJson(request));
  return ok(await allocateResource(input, actor), 201);
});