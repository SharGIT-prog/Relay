import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export async function createRecoveryEpisode(input, actor) {
  return withTransaction(async (conn) => {
    const [p] = await conn.execute('SELECT 1 FROM patient WHERE patient_id = ?', [input.patientId]);
    if (!p.length) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Patient not found');
    const [f] = await conn.execute('SELECT 1 FROM facility WHERE facility_id = ?', [input.facilityId]);
    if (!f.length) throw new ApiError(404, 'FACILITY_NOT_FOUND', 'Facility not found');
    const [res] = await conn.execute(
      'INSERT INTO recovery_episode (patient_id, facility_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
      [input.patientId, input.facilityId, input.startDate, input.endDate ?? null, input.status]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'RECOVERY_EPISODE_CREATED', entityType: 'RECOVERY_EPISODE', entityId: res.insertId,
      details: { patientId: input.patientId, facilityId: input.facilityId, status: input.status },
    });
    return res.insertId;
  });
}

export async function getRecoveryDetail(id, db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT re.recovery_id, re.patient_id, p.name AS patient_name, re.facility_id, f.name AS facility_name,
            re.start_date, re.end_date, re.status
     FROM recovery_episode re JOIN patient p ON p.patient_id = re.patient_id
     JOIN facility f ON f.facility_id = re.facility_id WHERE re.recovery_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'RECOVERY_NOT_FOUND', 'Recovery episode not found');
  const [requirements] = await db.execute(
    `SELECT requirement_id, discharge_id, resource_type, required_form, required_until, status
     FROM transition_requirement WHERE recovery_id = ? ORDER BY requirement_id`, [id]);
  return { ...rows[0], requirements };
}