import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireClient } from '@/lib/api-client-auth.mjs';
import { actOnHandoff } from '@/lib/external-service.mjs';

// The state change itself is audited (HANDOFF_ACKNOWLEDGED, with this client's id) inside the transaction.
export const POST = route(async (request, ctx) => {
  const client = await requireClient(request);
  const handoff = await actOnHandoff(parseIdParam((await ctx.params).id), 'acknowledge', client);
  return ok({ schemaVersion: '1.0', handoff });
});