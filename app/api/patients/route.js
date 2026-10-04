import { route, ok, readJson, parseBody, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import {
  patientsQuerySchema,
  createPatientSchema,
} from '@/lib/schemas.mjs';
import {
  listPatients,
  createPatient,
} from '@/lib/patient-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);

  const q = parseQuery(patientsQuerySchema, request);
  const patients = await listPatients(q);

  return ok({
    patients: patients ?? [],
    limit: q.limit,
    offset: q.offset,
  });
});

export const POST = route(async (request) => {
  const actor = await requireAuth(request);

  const input = parseBody(
    createPatientSchema,
    await readJson(request)
  );

  const patient = await createPatient(input, actor);

  return ok({ patient }, 201);
});