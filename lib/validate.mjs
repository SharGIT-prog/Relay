import { z } from 'zod';

export const idNumber = z.number().int().positive();                 // JSON id
export const idQuery = z.coerce.number().int().positive();           // Query id

export const dateTime = z.string().trim().transform((s, ctx) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
    const sec = Number(m[6] ?? 0);
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d &&
        dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === sec) {
      return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? '00'}`;
    }
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a valid date-time such as 2031-02-01T10:00' });
  return z.NEVER;
});