import { route, ok, parseParams } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { idNumber } from '@/lib/validate.mjs';
import { getAdmission } from '@/lib/admission-service.mjs';

export const GET = route(async (request, { params }) => {
  await requireAuth(request);

  const { id } = parseParams(
    { id: idNumber },
    params
  );

  const admission = await getAdmission(id);

  return ok({ admission });
});