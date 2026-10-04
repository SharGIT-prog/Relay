import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireClient, auditApi } from '@/lib/api-client-auth.mjs';
import { getPatientForClient } from '@/lib/external-service.mjs';

export const GET = route(async (request, ctx) => {
  const client = await requireClient(request);
  const id = parseIdParam((await ctx.params).id);

  const patient = await getPatientForClient(id, client);

  await auditApi(client, {
    action: 'API_GET_PATIENT',
    entityType: 'PATIENT',
    entityId: id,
  });

  return ok({
    schemaVersion: '1.0',
    patient,
  });
});