export async function writeAudit(db, { userId = null, clientId = null, action, entityType, entityId, details = null }) {
  await db.execute(
    `INSERT INTO audit_log (user_id, client_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, clientId, action, entityType, String(entityId), details === null ? null : JSON.stringify(details)]
  );
}