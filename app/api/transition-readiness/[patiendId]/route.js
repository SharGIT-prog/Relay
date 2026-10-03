import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { getPatientReadiness } from '@/lib/readiness-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  const params = await ctx.params;
  const rawId = params.patientId ?? params.patiendId;
  const patientId = parseIdParam(rawId, 'PATIENT_NOT_FOUND');

  return ok(await getPatientReadiness(patientId));
});