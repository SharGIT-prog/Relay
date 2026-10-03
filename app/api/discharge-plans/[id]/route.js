import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { patchDischargePlanSchema } from '@/lib/schemas.mjs';
import { updateDischargePlan, getDischargePlanDetail } from '@/lib/discharge-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  return ok({ dischargePlan: await getDischargePlanDetail(id) });
});

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  const changes = parseBody(patchDischargePlanSchema, await readJson(request));
  await updateDischargePlan(id, changes, actor);
  return ok({ dischargePlan: await getDischargePlanDetail(id) });
});