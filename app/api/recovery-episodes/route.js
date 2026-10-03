import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createRecoveryEpisodeSchema } from '@/lib/schemas.mjs';
import { createRecoveryEpisode, getRecoveryDetail } from '@/lib/recovery-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);
  const input = parseBody(createRecoveryEpisodeSchema, await readJson(request));
  const id = await createRecoveryEpisode(input, actor);
  return ok({ recoveryEpisode: await getRecoveryDetail(id) }, 201);
});