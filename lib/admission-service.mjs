import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export async function getAdmission(id, db = getMysqlPool()) {
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
     WHERE a.admission_id = ?`,
    [id]
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
    [id]
  );

  return {
    ...rows[0],
    doctors,
  };
}

export async function createAdmission(input, actor) {
  return withTransaction(async (conn) => {
    const [patient] = await conn.execute(
      'SELECT patient_id FROM patient WHERE patient_id = ?',
      [input.patientId]
    );

    if (!patient.length) {
      throw new ApiError(
        404,
        'PATIENT_NOT_FOUND',
        'Patient not found'
      );
    }

    const [facility] = await conn.execute(
      'SELECT facility_id FROM facility WHERE facility_id = ?',
      [input.facilityId]
    );

    if (!facility.length) {
      throw new ApiError(
        404,
        'FACILITY_NOT_FOUND',
        'Facility not found'
      );
    }

    const [doctor] = await conn.execute(
      'SELECT doctor_id FROM doctor WHERE doctor_id = ?',
      [input.doctorId]
    );

    if (!doctor.length) {
      throw new ApiError(
        404,
        'DOCTOR_NOT_FOUND',
        'Doctor not found'
      );
    }

    const [result] = await conn.execute(
      `INSERT INTO admission
        (patient_id, facility_id, admission_date, discharge_date)
       VALUES (?, ?, ?, NULL)`,
      [
        input.patientId,
        input.facilityId,
        input.admissionDate,
      ]
    );

    const admissionId = result.insertId;

    await conn.execute(
      `INSERT INTO admission_doctor
        (admission_id, doctor_id)
       VALUES (?, ?)`,
      [admissionId, input.doctorId]
    );

    await writeAudit(conn, {
      userId: actor.userId,
      action: 'ADMISSION_CREATED',
      entityType: 'ADMISSION',
      entityId: admissionId,
      details: {
        patientId: input.patientId,
        facilityId: input.facilityId,
        doctorId: input.doctorId,
      },
    });

    return admissionId;
  });
}

export async function assignDoctor(admissionId, doctorId, actor) {
  return withTransaction(async (conn) => {
    const [admission] = await conn.execute(
      'SELECT admission_id FROM admission WHERE admission_id = ?',
      [admissionId]
    );

    if (!admission.length) {
      throw new ApiError(
        404,
        'ADMISSION_NOT_FOUND',
        'Admission not found'
      );
    }

    const [doctor] = await conn.execute(
      'SELECT doctor_id FROM doctor WHERE doctor_id = ?',
      [doctorId]
    );

    if (!doctor.length) {
      throw new ApiError(
        404,
        'DOCTOR_NOT_FOUND',
        'Doctor not found'
      );
    }

    const [existing] = await conn.execute(
      `SELECT admission_id
       FROM admission_doctor
       WHERE admission_id = ? AND doctor_id = ?`,
      [admissionId, doctorId]
    );

    if (existing.length) {
      throw new ApiError(
        409,
        'DOCTOR_ALREADY_ASSIGNED',
        'Doctor is already assigned to this admission'
      );
    }

    await conn.execute(
      `INSERT INTO admission_doctor
        (admission_id, doctor_id)
       VALUES (?, ?)`,
      [admissionId, doctorId]
    );

    await writeAudit(conn, {
      userId: actor.userId,
      action: 'ADMISSION_DOCTOR_ASSIGNED',
      entityType: 'ADMISSION',
      entityId: admissionId,
      details: {
        doctorId,
      },
    });

    return getAdmission(admissionId, conn);
  });
}