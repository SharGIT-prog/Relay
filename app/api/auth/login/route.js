import { z } from 'zod';
import { route, json, readJson, parseBody, clientIp } from '@/lib/http.mjs';
import { loginUser, createSessionToken, setSessionCookie } from '@/lib/auth.mjs';
import { loginSchema } from '@/lib/schemas.mjs';

export const POST = route(async (request) => {
  const body = parseBody(loginSchema, await readJson(request));
  const user = await loginUser({ ...body, ip: clientIp(request) });
  const response = json({ user });
  setSessionCookie(response, await createSessionToken(user.userId));
  return response;
});