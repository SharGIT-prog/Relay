import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { facilityBodySchema } from '@/lib/schemas-accounts.mjs';
import { listFacilities, createFacility } from '@/lib/master-data-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);
  return ok({ facilities: await listFacilities() });
});

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  return ok({ facility: await createFacility(parseBody(facilityBodySchema, await readJson(request)), actor) }, 201);
});