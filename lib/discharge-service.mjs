// Discharge-plan rules
import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

const TRANSITIONS = {
  PLANNED: ['READY', 'CANCELLED'],
  READY: ['PLANNED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

async function assertDoctorAssigned(conn, doctorId, admissionId) {
  const [d] = await conn.execute('SELECT 1 FROM doctor WHERE doctor_id = ?', [doctorId]);
  if (!d.length) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found');
  const [a] = await conn.execute('SELECT 1 FROM admission_doctor WHERE admission_id = ? AND doctor_id = ?', [admissionId, doctorId]);
  if (!a.length) throw new ApiError(422, 'DOCTOR_NOT_ASSIGNED', 'The doctor is not assigned to this admission');
}

async function assertDestination(conn, facilityId, admissionFacilityId) {
  if (facilityId == null) return;
  const [f] = await conn.execute('SELECT 1 FROM facility WHERE facility_id = ?', [facilityId]);
  if (!f.length) throw new ApiError(404, 'FACILITY_NOT_FOUND', 'Destination facility not found');
  if (facilityId === admissionFacilityId) {
    throw new ApiError(422, 'SAME_FACILITY', 'The destination facility must differ from the admission facility');
  }
}

export async function createDischargePlan(input, actor) {
  return withTransaction(async (conn) => {
    // Lock admission row so two simultaneous requests can't create a plan
    const [adm] = await conn.execute(
      'SELECT admission_id, facility_id, admission_date FROM admission WHERE admission_id = ? FOR UPDATE', [input.admissionId]);
    if (!adm.length) throw new ApiError(404, 'ADMISSION_NOT_FOUND', 'Admission not found');
    if (input.dischargeDate < adm[0].admission_date) {
      throw new ApiError(422, 'DATE_BEFORE_ADMISSION', 'The discharge date cannot be before the admission date');
    }
    await assertDoctorAssigned(conn, input.doctorId, input.admissionId);
    await assertDestination(conn, input.destinationFacilityId ?? null, adm[0].facility_id);

    const [open] = await conn.execute(
      "SELECT discharge_id FROM discharge_plan WHERE admission_id = ? AND status IN ('PLANNED', 'READY')", [input.admissionId]);
    if (open.length) {
      throw new ApiError(409, 'OPEN_PLAN_EXISTS', `Admission already has an open discharge plan (${open[0].discharge_id})`);
    }

    const [res] = await conn.execute(
      `INSERT INTO discharge_plan (admission_id, doctor_id, discharge_date, status, destination_facility_id, notes)
       VALUES (?, ?, ?, 'PLANNED', ?, ?)`,
      [input.admissionId, input.doctorId, input.dischargeDate, input.destinationFacilityId ?? null, input.notes ?? null]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'DISCHARGE_PLAN_CREATED', entityType: 'DISCHARGE_PLAN', entityId: res.insertId,
      details: { admissionId: input.admissionId, doctorId: input.doctorId, destinationFacilityId: input.destinationFacilityId ?? null },
    });
    return res.insertId;
  });
}

export async function updateDischargePlan(id, changes, actor) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT dp.discharge_id, dp.admission_id, dp.doctor_id, dp.discharge_date, dp.status,
              dp.destination_facility_id, dp.notes,
              a.facility_id AS admission_facility_id, a.admission_date
       FROM discharge_plan dp JOIN admission a ON a.admission_id = dp.admission_id
       WHERE dp.discharge_id = ? FOR UPDATE`, [id]);
    const cur = rows[0];
    if (!cur) throw new ApiError(404, 'DISCHARGE_NOT_FOUND', 'Discharge plan not found');
    if (cur.status === 'COMPLETED' || cur.status === 'CANCELLED') {
      throw new ApiError(409, 'PLAN_CLOSED', `The discharge plan is ${cur.status} and can no longer be changed`);
    }

    const next = {}; // column -> new value. Col names fixed in code
    if (changes.doctorId !== undefined && changes.doctorId !== cur.doctor_id) {
      await assertDoctorAssigned(conn, changes.doctorId, cur.admission_id);
      next.doctor_id = changes.doctorId;
    }
    if (changes.dischargeDate !== undefined && changes.dischargeDate !== cur.discharge_date) {
      if (changes.dischargeDate < cur.admission_date) {
        throw new ApiError(422, 'DATE_BEFORE_ADMISSION', 'The discharge date cannot be before the admission date');
      }
      next.discharge_date = changes.dischargeDate;
    }
    if (changes.destinationFacilityId !== undefined && changes.destinationFacilityId !== cur.destination_facility_id) {
      await assertDestination(conn, changes.destinationFacilityId, cur.admission_facility_id);
      next.destination_facility_id = changes.destinationFacilityId;
    }
    if (changes.notes !== undefined && changes.notes !== cur.notes) next.notes = changes.notes;

    if (changes.status !== undefined && changes.status !== cur.status) {
      if (!TRANSITIONS[cur.status].includes(changes.status)) {
        throw new ApiError(409, 'INVALID_TRANSITION', `Cannot change status from ${cur.status} to ${changes.status}`);
      }
      if (changes.status === 'READY' || changes.status === 'COMPLETED') {
        const [[o]] = await conn.execute(
          "SELECT COUNT(*) AS n FROM transition_requirement WHERE discharge_id = ? AND status IN ('PENDING', 'ALLOCATED')", [id]);
        if (o.n > 0) throw new ApiError(409, 'REQUIREMENTS_OUTSTANDING', `${o.n} transition requirement(s) are still outstanding`);
      }
      if (changes.status === 'COMPLETED') {
        const dest = 'destination_facility_id' in next ? next.destination_facility_id : cur.destination_facility_id;
        if (dest != null) {
          const [h] = await conn.execute('SELECT status FROM care_handoff WHERE discharge_id = ? ORDER BY handoff_id DESC LIMIT 1', [id]);
          if (!h.length || h[0].status !== 'ACKNOWLEDGED') {
            throw new ApiError(409, 'HANDOFF_NOT_ACKNOWLEDGED', 'The receiving facility has not acknowledged the handoff');
          }
        }
      }
      next.status = changes.status;
    }

    const cols = Object.keys(next);
    if (!cols.length) return;
    await conn.execute(
      `UPDATE discharge_plan SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE discharge_id = ?`,
      [...cols.map((c) => next[c]), id]);

    if (next.status === 'COMPLETED') {
      await conn.execute('UPDATE admission SET discharge_date = ? WHERE admission_id = ? AND discharge_date IS NULL',
        [next.discharge_date ?? cur.discharge_date, cur.admission_id]);
    }
    await writeAudit(conn, {
      userId: actor.userId, action: 'DISCHARGE_PLAN_UPDATED', entityType: 'DISCHARGE_PLAN', entityId: id,
      details: { before: Object.fromEntries(cols.map((c) => [c, cur[c]])), after: next },
    });
  });
}

export async function getDischargePlanDetail(id, db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT dp.discharge_id, dp.admission_id, dp.doctor_id, dp.discharge_date, dp.status,
            dp.destination_facility_id, dp.notes,
            a.patient_id, p.name AS patient_name, d.name AS doctor_name,
            f.name AS destination_facility_name
     FROM discharge_plan dp
     JOIN admission a ON a.admission_id = dp.admission_id
     JOIN patient p ON p.patient_id = a.patient_id
     JOIN doctor d ON d.doctor_id = dp.doctor_id
     LEFT JOIN facility f ON f.facility_id = dp.destination_facility_id
     WHERE dp.discharge_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'DISCHARGE_NOT_FOUND', 'Discharge plan not found');
  const [requirements] = await db.execute(
    `SELECT requirement_id, recovery_id, resource_type, required_form, required_until, status
     FROM transition_requirement WHERE discharge_id = ? ORDER BY requirement_id`, [id]);
  const [readiness] = await db.execute('SELECT * FROM v_transition_readiness WHERE discharge_id = ?', [id]);
  return { ...rows[0], requirements, readiness: readiness[0] ?? null };
}