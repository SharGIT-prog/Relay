import { route, ok, readJson, parseBody } from '@/lib/http.mjs';
import { requireAuth } from '@/lib/auth.mjs';
import { createAdmissionSchema } from '@/lib/schemas.mjs';
import {
  createAdmission,
  getAdmission,
} from '@/lib/admission-service.mjs';

export const POST = route(async (request) => {
  const actor = await requireAuth(request);

  const input = parseBody(
    createAdmissionSchema,
    await readJson(request)
  );

  const admissionId = await createAdmission(input, actor);

  return ok(
    {
      admission: await getAdmission(admissionId),
    },
    201
  );
});