import { route, json } from '@/lib/http.mjs';
import { getMysqlPool } from '@/lib/db-mysql.mjs';
import { getPgPool } from '@/lib/db-pg.mjs';

export const dynamic = 'force-dynamic';

// Public liveness check
export const GET = route(async () => {
  const status = { mysql: 'ok', postgres: 'ok' };
  await getMysqlPool().query('SELECT 1').catch(() => { status.mysql = 'down'; });
  await getPgPool().query('SELECT 1').catch(() => { status.postgres = 'down'; });
  return json(status, status.mysql === 'ok' && status.postgres === 'ok' ? 200 : 503);
});