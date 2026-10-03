import { z } from 'zod';
import { route, json, readJson, parseBody, clientIp } from '@/lib/http.mjs';
import { loginUser, createSessionToken, setSessionCookie } from '@/lib/auth.mjs';

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
}).strict();

export const POST = route(async (request) => {
  const body = parseBody(loginSchema, await readJson(request));
  const user = await loginUser({ ...body, ip: clientIp(request) });
  const response = json({ user });
  setSessionCookie(response, await createSessionToken(user.userId));
  return response;
});