import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { getHandoffDetail } from '@/lib/handoff-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  return ok({ handoff: await getHandoffDetail(parseIdParam((await ctx.params).id)) });
});