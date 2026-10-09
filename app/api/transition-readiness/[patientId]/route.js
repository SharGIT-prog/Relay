import { route, ok, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { getPatientReadiness } from '@/lib/readiness-service.mjs';

export const GET = route(async (request, ctx) => {
  await requireAuth(request);
  return ok(await getPatientReadiness(parseIdParam((await ctx.params).patientId)));
});