import { route, ok, readJson, parseBody, parseIdParam } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { adminPatchUserSchema } from '@/lib/schemas-accounts.mjs';
import { updateUser } from '@/lib/account-service.mjs';

export const PATCH = route(async (request, ctx) => {
  const actor = await requireAuth(request, { roles: ['ADMIN'] });
  const id = parseIdParam((await ctx.params).id);
  return ok({ user: await updateUser(id, parseBody(adminPatchUserSchema, await readJson(request)), actor) });
});