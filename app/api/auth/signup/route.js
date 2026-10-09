import { route, ok, readJson, parseBody, clientIp, ApiError } from '@/lib/http.mjs';
import { signupSchema } from '@/lib/schemas-accounts.mjs';
import { signUp } from '@/lib/account-service.mjs';

export const POST = route(async (request) => {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  const body = parseBody(signupSchema, await readJson(request));
  return ok(await signUp(body, clientIp(request)), 201);
});