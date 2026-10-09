import { route, ok, readJson, parseBody, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { doctorBodySchema, doctorsQuerySchema } from '@/lib/schemas-accounts.mjs';
import { listDoctors, createDoctor } from '@/lib/master-data-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);
  return ok({ doctors: await listDoctors(parseQuery(doctorsQuerySchema, request)) });
});

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  return ok({ doctor: await createDoctor(parseBody(doctorBodySchema, await readJson(request)), actor) }, 201);
});