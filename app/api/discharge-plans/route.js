import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createDischargePlanSchema } from '@/lib/schemas.mjs';
import { createDischargePlan, getDischargePlanDetail } from '@/lib/discharge-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(createDischargePlanSchema, await readJson(request));
  const id = await createDischargePlan(input, actor);
  return ok({ dischargePlan: await getDischargePlanDetail(id) }, 201);
});