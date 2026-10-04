import { route, ok, parseParams } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { idNumber } from '@/lib/validate.mjs';
import { getPatientReadiness } from '@/lib/readiness-service.mjs';

export const GET = route(async (request, { params }) => {
  await requireAuth(request);

  const { id } = parseParams(
    { id: idNumber },
    params
  );

  const transition = await getPatientReadiness(id);

  return ok({ transition });
});