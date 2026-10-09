import { route, ok, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { lookupAdmissionsQuerySchema } from '@/lib/schemas-accounts.mjs';
import { lookupAdmissions } from '@/lib/master-data-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request);
  const { patientId } = parseQuery(lookupAdmissionsQuerySchema, request);
  return ok({ admissions: await lookupAdmissions(patientId) });
});