import { route, ok, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { resourcesQuerySchema, availableResourcesQuerySchema } from '@/lib/schemas.mjs';
import { listResources, listAvailableResources } from '@/lib/resource-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);

  const url = new URL(request.url);
  const isAvailable = url.pathname.endsWith('/available') || url.searchParams.get('__subroute') === 'available';

  if (isAvailable) {
    const q = parseQuery(availableResourcesQuerySchema, request);
    const resources = await listAvailableResources(q);
    return ok({
      start: q.start,
      end: q.end,
      resources: resources ?? [],
    });
  }

  const q = parseQuery(resourcesQuerySchema, request);
  const resources = await listResources(q);
  return ok({
    resources: resources ?? [],
    limit: q.limit,
    offset: q.offset,
  });
});
