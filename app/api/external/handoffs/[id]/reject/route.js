import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireClient } from '@/lib/api-client-auth.mjs';
import { actOnHandoff } from '@/lib/external-service.mjs';

export const POST = route(async (request, ctx) => {
  const client = await requireClient(request);
  const handoff = await actOnHandoff(parseIdParam((await ctx.params).id), 'reject', client);
  return ok({ schemaVersion: '1.0', handoff });
});