import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { doctorPatchSchema } from '@/lib/schemas-accounts.mjs';
import { updateDoctor, deleteDoctor } from '@/lib/master-data-service.mjs';

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  const id = parseIdParam((await ctx.params).id);
  return ok({ doctor: await updateDoctor(id, parseBody(doctorPatchSchema, await readJson(request)), actor) });
});

export const DELETE = route(async (request, ctx) => {
  const actor = await requireAuth(request);
  await deleteDoctor(parseIdParam((await ctx.params).id), actor);
  return ok({ deleted: true });
});