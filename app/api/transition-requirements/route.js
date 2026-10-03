import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createRequirementSchema } from '@/lib/schemas.mjs';
import { createRequirement, getRequirementDetail } from '@/lib/requirement-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(createRequirementSchema, await readJson(request));
  const id = await createRequirement(input, actor);
  return ok({ requirement: await getRequirementDetail(id) }, 201);
});