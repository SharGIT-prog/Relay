import { route, ok, parseQuery } from '@/lib/http.mjs';
import { requireClient, auditApi } from '@/lib/api-client-auth.mjs';
import { externalListQuerySchema } from '@/lib/schemas.mjs';
import { listTransitions } from '@/lib/external-service.mjs';

export const GET = route(async (request) => {
  const client = await requireClient(request);
  const q = parseQuery(externalListQuerySchema, request);
  const transitions = await listTransitions(client, q);
  await auditApi(client, { action: 'API_LIST_TRANSITIONS', entityType: 'API', entityId: 'transitions', details: { ...q, count: transitions.length } });
  return ok({ schemaVersion: '1.0', transitions });
});