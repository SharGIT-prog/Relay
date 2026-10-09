import { route, ok, parseQuery } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { usersQuerySchema } from '@/lib/schemas-accounts.mjs';
import { listUsers } from '@/lib/account-service.mjs';

export const GET = route(async (request) => {
  await requireAuth(request, { roles: ['ADMIN'] });
  return ok({ users: await listUsers(parseQuery(usersQuerySchema, request)) });
});