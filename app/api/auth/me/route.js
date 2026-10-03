import { route, json } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';

export const GET = route(async (request) => json({ user: await requireAuth(request) }));