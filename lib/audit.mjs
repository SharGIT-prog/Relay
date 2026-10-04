export async function writeAudit(db, { userId = null, clientId = null, action, entityType, entityId = '0', details = null }) {
  const eid = entityId !== null && entityId !== undefined ? String(entityId) : '0';
  const det = details === null || details === undefined ? null : JSON.stringify(details);

  await db.execute(
    `INSERT INTO audit_log (user_id, client_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId ?? null, clientId ?? null, action, entityType, eid, det]
  );
}

export function actorIds(actor) {
  if (!actor) return { userId: null, clientId: null };
  return {
    userId: actor.userId ?? null,
    clientId: actor.clientId ?? null,
  };
}