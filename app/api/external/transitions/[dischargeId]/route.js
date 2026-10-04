import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireClient, auditApi } from '@/lib/api-client-auth.mjs';
import { getTransitionPayload } from '@/lib/external-service.mjs';

export const GET = route(async (request, ctx) => {
  const client = await requireClient(request);
  const id = parseIdParam((await ctx.params).dischargeId);
  const payload = await getTransitionPayload(id, client);
  await auditApi(client, { action: 'API_GET_TRANSITION', entityType: 'DISCHARGE_PLAN', entityId: id });
  return ok(payload);
});