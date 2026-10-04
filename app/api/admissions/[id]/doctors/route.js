import {
  route,
  ok,
  readJson,
  parseBody,
  parseIdParam,
} from '@/lib/http.mjs';

import { requireAuth } from '@/lib/auth.mjs';
import { admissionDoctorSchema } from '@/lib/schemas.mjs';
import { assignDoctor } from '@/lib/admission-service.mjs';

export const POST = route(async (request, { params }) => {
  const actor = await requireAuth(request);

  const id = parseIdParam((await params).id);

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