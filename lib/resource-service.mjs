import { getMysqlPool } from './db-mysql.mjs';
export async function listResources(q, db = getMysqlPool()) {
  let sql = `SELECT r.resource_id, r.resource_type, r.availability, r.facility_id, f.name AS facility_name
             FROM resource r JOIN facility f ON f.facility_id = r.facility_id WHERE 1 = 1`;
  const p = [];
  if (q.resourceType !== undefined) { sql += ' AND r.resource_type = ?'; p.push(q.resourceType); }
  if (q.facilityId !== undefined)   { sql += ' AND r.facility_id = ?';   p.push(q.facilityId); }
  if (q.availability !== undefined) { sql += ' AND r.availability = ?';  p.push(q.availability); }
  sql += ' ORDER BY r.resource_type, r.facility_id, r.resource_id LIMIT ? OFFSET ?';
  p.push(q.limit, q.offset);
  const [rows] = await db.query(sql, p);
  return rows;
}

/** Resources that're AVAILABLE + no overlapping ACTIVE allocation in [start, end). */
export async function listAvailableResources(q, db = getMysqlPool()) {
  let sql = `SELECT r.resource_id, r.resource_type, r.availability, r.facility_id, f.name AS facility_name
             FROM resource r JOIN facility f ON f.facility_id = r.facility_id
             WHERE r.availability = 'AVAILABLE'
               AND NOT EXISTS (
                     SELECT 1 FROM resource_allocation ra
                     WHERE ra.resource_id = r.resource_id AND ra.allocation_status = 'ACTIVE'
                       AND ra.start_time < ? AND ra.end_time > ?)`;
  const p = [q.end, q.start];
  if (q.resourceType !== undefined) { sql += ' AND r.resource_type = ?'; p.push(q.resourceType); }
  if (q.facilityId !== undefined)   { sql += ' AND r.facility_id = ?';   p.push(q.facilityId); }
  sql += ' ORDER BY r.resource_type, r.facility_id, r.resource_id LIMIT ?';
  p.push(q.limit);
  const [rows] = await db.query(sql, p);
  return rows;
}