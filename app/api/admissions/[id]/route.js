import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { getAdmission } from '@/lib/admission-service.mjs';

export const GET = route(async (request, { params }) => {
  await requireAuth(request);

  const id = parseIdParam((await params).id);

  const admission = await getAdmission(id);

  return ok({ admission });
});