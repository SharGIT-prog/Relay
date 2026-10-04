import {
  route,
  ok,
  readJson,
  parseBody,
  parseParams,
} from '@/lib/http.mjs';

import { requireAuth } from '@/lib/auth.mjs';
import { idNumber } from '@/lib/validate.mjs';
import { admissionDoctorSchema } from '@/lib/schemas.mjs';

import {
  assignDoctor,
} from '@/lib/admission-service.mjs';

export const POST = route(async (request, { params }) => {
  const actor = await requireAuth(request);

  const { id } = parseParams(
    { id: idNumber },
    params
  );

  const input = parseBody(
    admissionDoctorSchema,
    await readJson(request)
  );

  const admission = await assignDoctor(
    id,
    input.doctorId,
    actor
  );

  return ok({ admission }, 201);
});