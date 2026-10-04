import { route, ok, parseBody, readJson, parseParams } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { idNumber } from '@/lib/validate.mjs';
import { patchPatientSchema } from '@/lib/schemas.mjs';
import {
  getPatient,
  updatePatient,
} from '@/lib/patient-service.mjs';

export const GET = route(async (request, { params }) => {
  await requireAuth(request);

  const { id } = parseParams(
    { id: idNumber },
    params
  );

  const patient = await getPatient(id);

  return ok({ patient });
});

export const PATCH = route(async (request, { params }) => {
  const actor = await requireAuth(request);

  const { id } = parseParams(
    { id: idNumber },
    params
  );

  const input = parseBody(
    patchPatientSchema,
    await readJson(request)
  );

  const patient = await updatePatient(id, input, actor);

  return ok({ patient });
});