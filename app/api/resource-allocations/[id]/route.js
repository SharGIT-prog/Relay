import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { allocationStatusSchema } from '@/lib/schemas.mjs';
import { updateAllocationStatus } from '@/lib/allocation-service.mjs';

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  const { status } = parseBody(allocationStatusSchema, await readJson(request));
  return ok(await updateAllocationStatus(id, status, actor));
});