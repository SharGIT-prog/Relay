import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { getRecoveryDetail } from '@/lib/recovery-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  return ok({ recoveryEpisode: await getRecoveryDetail(parseIdParam((await ctx.params).id)) });
});