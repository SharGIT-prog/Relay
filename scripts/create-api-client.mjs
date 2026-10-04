import { getMysqlPool, closeMysql, withTransaction } from '../lib/db-mysql.mjs';
import { newCredential, buildToken } from '../lib/api-client-auth.mjs';

const args = process.argv.slice(2);
const opt = { facility: [] };
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { console.error(`Unexpected argument: ${args[i]}`); process.exit(2); }
  const k = args[i].slice(2), v = args[++i];
  if (k === 'facility') opt.facility.push(v); else opt[k] = v;
}

const pool = getMysqlPool();
let code = 0;
try {
  if (opt.revoke) {
    const [r] = await pool.execute("UPDATE api_client SET status = 'REVOKED' WHERE client_id = ?", [Number(opt.revoke)]);
    console.log(r.affectedRows ? `Client ${opt.revoke} revoked.` : `No client ${opt.revoke}.`);
  } else {
    const facilities = opt.facility.map(Number);
    if (!opt.name || !facilities.length || facilities.some((f) => !Number.isSafeInteger(f) || f <= 0)) {
      console.error('Usage: create-api-client.mjs --name <name> [--type <type>] --facility <id> [--facility <id>...]');
      process.exit(2);
    }
    const { secret, hash } = newCredential();
    const clientId = await withTransaction(async (conn) => {
      const [res] = await conn.execute(
        "INSERT INTO api_client (client_name, client_type, credential_hash, status, created_at) VALUES (?, ?, ?, 'ACTIVE', NOW())",
        [opt.name, opt.type ?? 'HOSPITAL_SYSTEM', hash]);
      for (const f of facilities) {
        await conn.execute('INSERT INTO api_client_facility (client_id, facility_id) VALUES (?, ?)', [res.insertId, f]); // FK rejects unknown facilities
      }
      return res.insertId;
    });
    console.log(`Created API client ${clientId} (${opt.name}) for facilities ${facilities.join(', ')}.\n`);
    console.log('Token (shown only once, store it securely):');
    console.log(buildToken(clientId, secret));
  }
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  code = 1;
} finally {
  await closeMysql();
}
process.exit(code);