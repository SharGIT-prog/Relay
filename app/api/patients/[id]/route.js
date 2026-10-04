import {
  route,
  ok,
  parseBody,
  readJson,
  parseIdParam,
} from '@/lib/http.mjs';

import { requireAuth } from '@/lib/auth.mjs';

import {
  getPatient,
  updatePatient,
} from '@/lib/patient-service.mjs';

import { patchPatientSchema } from '@/lib/schemas.mjs';

export const GET = route(async (request, { params }) => {
  await requireAuth(request);

  const id = parseIdParam((await params).id);

  const patient = await getPatient(id);

  return ok({ patient });
});

export const PATCH = route(async (request, { params }) => {
  const actor = await requireAuth(request);

  const id = parseIdParam((await params).id);

  const input = parseBody(
    patchPatientSchema,
    await readJson(request)
  );

  const patient = await updatePatient(
    id,
    input,
    actor
  );

  return ok({ patient });
});