import { route, ok, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { availableResourcesQuerySchema } from '@/lib/schemas.mjs';
import { listAvailableResources } from '@/lib/resource-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);
  const q = parseQuery(availableResourcesQuerySchema, request);
  return ok({ start: q.start, end: q.end, resources: await listAvailableResources(q) });
});