import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { patchRequirementSchema } from '@/lib/schemas.mjs';
import { updateRequirement, getRequirementDetail } from '@/lib/requirement-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  return ok({ requirement: await getRequirementDetail(parseIdParam((await ctx.params).id)) });
});

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  await updateRequirement(id, parseBody(patchRequirementSchema, await readJson(request)), actor);
  return ok({ requirement: await getRequirementDetail(id) });
});