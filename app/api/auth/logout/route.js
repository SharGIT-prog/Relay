import { route, json } from '@/lib/http.mjs';
import { clearSessionCookie } from '@/lib/auth.mjs';

export const POST = route(async () => {
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
});