// Facilities, doctors and the admissions lookup used by planning pages.
import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export async function listFacilities(db = getMysqlPool()) {
  const [rows] = await db.execute('SELECT facility_id, name, facility_type, address, contact_number FROM facility ORDER BY name, facility_id');
  return rows;
}
export async function createFacility(b, actor) {
  return withTransaction(async (conn) => {
    const [r] = await conn.execute('INSERT INTO facility (name, facility_type, address, contact_number) VALUES (?, ?, ?, ?)', [b.name, b.facilityType, b.address, b.contactNumber]);
    await writeAudit(conn, { userId: actor.userId, action: 'FACILITY_CREATED', entityType: 'FACILITY', entityId: r.insertId, details: { name: b.name } });
    return { facility_id: r.insertId, name: b.name, facility_type: b.facilityType, address: b.address, contact_number: b.contactNumber };
  });
}

export async function listDoctors({ q, limit }, db = getMysqlPool()) {
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const [rows] = await db.query(
    `SELECT doctor_id, name, specialisation, contact_number FROM doctor
     ${like ? 'WHERE name LIKE ? OR specialisation LIKE ?' : ''} ORDER BY name, doctor_id LIMIT ?`,
    like ? [like, like, limit] : [limit]);
  return rows;
}
async function getDoctor(id, db = getMysqlPool()) {
  const [r] = await db.execute('SELECT doctor_id, name, specialisation, contact_number FROM doctor WHERE doctor_id = ?', [id]);
  if (!r.length) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found');
  return r[0];
}
export async function createDoctor(b, actor) {
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.execute('INSERT INTO doctor (name, specialisation, contact_number) VALUES (?, ?, ?)', [b.name, b.specialisation, b.contactNumber]);
    await writeAudit(conn, { userId: actor.userId, action: 'DOCTOR_CREATED', entityType: 'DOCTOR', entityId: r.insertId, details: { name: b.name } });
    return r.insertId;
  });
  return getDoctor(id);
}
export async function updateDoctor(id, c, actor) {
  const map = { name: 'name', specialisation: 'specialisation', contactNumber: 'contact_number' }; 
  const cols = Object.keys(c).filter((k) => map[k]);
  await withTransaction(async (conn) => {
    const [r] = await conn.execute(`UPDATE doctor SET ${cols.map((k) => `${map[k]} = ?`).join(', ')} WHERE doctor_id = ?`, [...cols.map((k) => c[k]), id]);
    if (!r.affectedRows) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found');
    await writeAudit(conn, { userId: actor.userId, action: 'DOCTOR_UPDATED', entityType: 'DOCTOR', entityId: id, details: c });
  });
  return getDoctor(id);
}
export async function deleteDoctor(id, actor) {
  await withTransaction(async (conn) => {
    const [r] = await conn.execute('DELETE FROM doctor WHERE doctor_id = ?', [id]); // FK RESTRICT -> 409 if assigned or planning discharge
    if (!r.affectedRows) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found');
    await writeAudit(conn, { userId: actor.userId, action: 'DOCTOR_DELETED', entityType: 'DOCTOR', entityId: id });
  });
}

export async function lookupAdmissions(patientId, db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT a.admission_id, a.patient_id, a.facility_id, f.name AS facility_name, a.admission_date, a.discharge_date
     FROM admission a JOIN facility f ON f.facility_id = a.facility_id
     WHERE a.patient_id = ? ORDER BY a.admission_date DESC, a.admission_id DESC`, [patientId]);
  if (!rows.length) return [];
  const [docs] = await db.query(
    `SELECT ad.admission_id, d.doctor_id, d.name, d.specialisation
     FROM admission_doctor ad JOIN doctor d ON d.doctor_id = ad.doctor_id WHERE ad.admission_id IN (?) ORDER BY d.name`, [rows.map((r) => r.admission_id)]);
  return rows.map((r) => ({ ...r, doctors: docs.filter((d) => d.admission_id === r.admission_id).map(({ admission_id, ...d }) => d) }));
}