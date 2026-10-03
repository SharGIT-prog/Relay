// Helpers shared by every route handler.
import { NextResponse } from 'next/server';
import { ApiError, toApiError } from './errors.mjs';

export { ApiError };

export const json = (data, status = 200) => NextResponse.json(data, { status });

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
export function camelize(v) {
  if (Array.isArray(v)) return v.map(camelize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), camelize(x)]));
  return v;
}

/** JSON response with snake_case database keys converted to camelCase. */
export const ok = (data, status = 200) => json(camelize(data), status);

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

export function parseBody(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid request',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const parseQuery = (schema, request) =>
  parseBody(schema, Object.fromEntries(new URL(request.url).searchParams));

export function parseIdParam(value) {
  const n = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n <= 0) {
    throw new ApiError(400, 'INVALID_ID', 'The id in the URL must be a positive integer');
  }
  return n;
}

/** Wraps a handler => error = JSON { error: { code, message } } response. */
export function route(handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (e) {
      const api = toApiError(e);
      if (api) {
        return json({ error: { code: api.code, message: api.message, ...(api.details ? { details: api.details } : {}) } }, api.status);
      }
      console.error('Unhandled API error:', e);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  };
}

export const clientIp = (request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';