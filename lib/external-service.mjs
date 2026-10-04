import { getMysqlPool } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { transitionHandoff } from './handoff-service.mjs';

export async function listTransitions(
  client,
  { handoffStatus, limit },
  db = getMysqlPool()
) {
  const ids = client.facilityIds;

  let sql = `
    SELECT
      v.discharge_id,
      v.admission_id,
      v.patient_id,
      v.discharge_status,
      v.discharge_date,
      v.destination_facility_id,
      a.facility_id AS from_facility_id,
      v.readiness_status,
      v.outstanding_requirements,
      v.handoff_id,
      v.handoff_status
    FROM v_transition_readiness v
    JOIN admission a
      ON a.admission_id = v.admission_id
    WHERE (
      v.destination_facility_id IN (?)
      OR a.facility_id IN (?)
    )
  `;

  const p = [ids, ids];

  if (handoffStatus) {
    sql += ' AND v.handoff_status = ?';
    p.push(handoffStatus);
  }

  sql += ' ORDER BY v.discharge_id DESC LIMIT ?';
  p.push(limit);

  const [rows] = await db.query(sql, p);

  return rows;
}

export async function getTransitionPayload(
  dischargeId,
  client,
  db = getMysqlPool()
) {
  const ids = client.facilityIds;

  const [rows] = await db.execute(
    `SELECT
       dp.discharge_id,
       dp.admission_id,
       dp.status,
       dp.discharge_date,
       dp.destination_facility_id,
       df.name AS destination_facility_name,
       a.facility_id AS from_facility_id,
       ff.name AS from_facility_name,
       a.admission_date,
       a.patient_id,
       p.name AS patient_name,
       p.DOB AS date_of_birth
     FROM discharge_plan dp
     JOIN admission a
       ON a.admission_id = dp.admission_id
     JOIN patient p
       ON p.patient_id = a.patient_id
     JOIN facility ff
       ON ff.facility_id = a.facility_id
     LEFT JOIN facility df
       ON df.facility_id = dp.destination_facility_id
     WHERE dp.discharge_id = ?`,
    [dischargeId]
  );

  const d = rows[0];

  if (
    !d ||
    !(
      ids.includes(d.from_facility_id) ||
      ids.includes(d.destination_facility_id)
    )
  ) {
    throw new ApiError(
      404,
      'TRANSITION_NOT_FOUND',
      'Transition not found'
    );
  }

  const [[v]] = await db.execute(
    'SELECT * FROM v_transition_readiness WHERE discharge_id = ?',
    [dischargeId]
  );

  const [reqs] = await db.execute(
    `SELECT
       requirement_id,
       resource_type,
       required_form,
       required_until,
       status
     FROM transition_requirement
     WHERE discharge_id = ?
       AND status <> 'CANCELLED'
     ORDER BY requirement_id`,
    [dischargeId]
  );

  let allocs = [];

  if (reqs.length) {
    [allocs] = await db.query(
      `SELECT
         allocation_id,
         requirement_id,
         resource_id,
         resource_type,
         start_time,
         end_time,
         allocation_status
       FROM resource_allocation
       WHERE requirement_id IN (?)
         AND allocation_status IN ('ACTIVE', 'COMPLETED')
       ORDER BY allocation_id`,
      [reqs.map((r) => r.requirement_id)]
    );
  }

  const [handoffs] = await db.execute(
    `SELECT
       handoff_id,
       from_facility_id,
       to_facility_id,
       status,
       handoff_date,
       acknowledged_at
     FROM care_handoff
     WHERE discharge_id = ?
     ORDER BY handoff_id`,
    [dischargeId]
  );

  return {
    schema_version: '1.0',

    patient: {
      patient_id: d.patient_id,
      name: d.patient_name,
      date_of_birth: d.date_of_birth,
    },

    admission: {
      admission_id: d.admission_id,
      facility_id: d.from_facility_id,
      facility_name: d.from_facility_name,
      admission_date: d.admission_date,
    },

    discharge: {
      discharge_id: d.discharge_id,
      status: d.status,
      discharge_date: d.discharge_date,
      destination_facility_id: d.destination_facility_id,
      destination_facility_name: d.destination_facility_name,
    },

    readiness: {
      status: v.readiness_status,
      total_requirements: Number(v.total_requirements),
      fulfilled_requirements: Number(v.fulfilled_requirements),
      outstanding_requirements: Number(v.outstanding_requirements),
      next_deadline: v.next_deadline,
    },

    requirements: reqs.map((r) => ({
      ...r,
      allocations: allocs
        .filter((a) => a.requirement_id === r.requirement_id)
        .map(({ requirement_id, ...a }) => a),
    })),

    handoff: handoffs.at(-1) ?? null,
    handoffs,
  };
}

/**
 * Return a patient only when the API client is authorised
 * for at least one facility where the patient has an admission.
 */
export async function getPatientForClient(
  patientId,
  client,
  db = getMysqlPool()
) {
  const [rows] = await db.execute(
    `SELECT DISTINCT
       p.patient_id,
       p.name,
       p.DOB
     FROM patient p
     JOIN admission a
       ON a.patient_id = p.patient_id
     WHERE p.patient_id = ?
       AND a.facility_id IN (?)`,
    [patientId, client.facilityIds]
  );

  if (!rows.length) {
    throw new ApiError(
      404,
      'PATIENT_NOT_FOUND',
      'Patient not found'
    );
  }

  return rows[0];
}

/**
 * Return an admission only when the API client is authorised
 * for the admission's facility.
 */
export async function getAdmissionForClient(
  admissionId,
  client,
  db = getMysqlPool()
) {
  const [rows] = await db.execute(
    `SELECT
       a.admission_id,
       a.patient_id,
       p.name AS patient_name,
       a.facility_id,
       f.name AS facility_name,
       a.admission_date,
       a.discharge_date
     FROM admission a
     JOIN patient p
       ON p.patient_id = a.patient_id
     JOIN facility f
       ON f.facility_id = a.facility_id
     WHERE a.admission_id = ?
       AND a.facility_id IN (?)`,
    [admissionId, client.facilityIds]
  );

  if (!rows.length) {
    throw new ApiError(
      404,
      'ADMISSION_NOT_FOUND',
      'Admission not found'
    );
  }

  const [doctors] = await db.execute(
    `SELECT
       d.doctor_id,
       d.name,
       d.specialisation,
       d.contact_number
     FROM admission_doctor ad
     JOIN doctor d
       ON d.doctor_id = ad.doctor_id
     WHERE ad.admission_id = ?
     ORDER BY d.name, d.doctor_id`,
    [admissionId]
  );

  return {
    ...rows[0],
    doctors,
  };
}

async function visibleHandoff(id, client, db) {
  const ids = client.facilityIds;

  const [rows] = await db.execute(
    `SELECT
       h.handoff_id,
       h.admission_id,
       h.discharge_id,
       h.from_facility_id,
       ff.name AS from_facility_name,
       h.to_facility_id,
       tf.name AS to_facility_name,
       h.status,
       h.handoff_date,
       h.acknowledged_at,
       dp.status AS discharge_status
     FROM care_handoff h
     JOIN facility ff
       ON ff.facility_id = h.from_facility_id
     JOIN facility tf
       ON tf.facility_id = h.to_facility_id
     JOIN discharge_plan dp
       ON dp.discharge_id = h.discharge_id
     WHERE h.handoff_id = ?`,
    [id]
  );

  const h = rows[0];

  if (
    !h ||
    !(
      ids.includes(h.from_facility_id) ||
      ids.includes(h.to_facility_id)
    )
  ) {
    throw new ApiError(
      404,
      'HANDOFF_NOT_FOUND',
      'Handoff not found'
    );
  }

  return h;
}

export const getHandoffForClient = (
  id,
  client,
  db = getMysqlPool()
) => visibleHandoff(id, client, db);

/**
 * Acknowledge or reject.
 * Only a client scoped to the receiving facility may do so.
 */
export async function actOnHandoff(
  id,
  action,
  client,
  db = getMysqlPool()
) {
  const h = await visibleHandoff(id, client, db);

  if (!client.facilityIds.includes(h.to_facility_id)) {
    throw new ApiError(
      403,
      'NOT_RECEIVING_FACILITY',
      'Only the receiving facility can acknowledge or reject a handoff'
    );
  }

  await transitionHandoff(id, action, {
    clientId: client.clientId,
  });

  return visibleHandoff(id, client, db);
}