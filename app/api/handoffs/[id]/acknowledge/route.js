import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { transitionHandoff, getHandoffDetail } from '@/lib/handoff-service.mjs';

export const POST = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  await transitionHandoff(id, 'acknowledge', actor);
  return ok({ handoff: await getHandoffDetail(id) });
});