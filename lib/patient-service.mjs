import { getMysqlPool } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export async function listPatients(q, db = getMysqlPool()) {
  let sql = `
    SELECT patient_id, name, DOB
    FROM patient
    WHERE 1 = 1
  `;

  const params = [];

  if (q.search !== undefined) {
    sql += ' AND name LIKE ?';
    params.push(`%${q.search}%`);
  }

  sql += ' ORDER BY name, patient_id LIMIT ? OFFSET ?';
  params.push(q.limit, q.offset);

  const [rows] = await db.execute(sql, params);
  return rows;
}

export async function getPatient(id, db = getMysqlPool()) {
  const [rows] = await db.execute(
    'SELECT patient_id, name, DOB FROM patient WHERE patient_id = ?',
    [id]
  );

  if (!rows.length) {
    throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Patient not found');
  }

  return rows[0];
}

export async function createPatient(input, actor, db = getMysqlPool()) {
  const [result] = await db.execute(
    'INSERT INTO patient (name, DOB) VALUES (?, ?)',
    [input.name, input.DOB]
  );

  const patient = await getPatient(result.insertId, db);

  await writeAudit(db, {
    userId: actor.userId,
    action: 'PATIENT_CREATED',
    entityType: 'PATIENT',
    entityId: result.insertId,
    details: {
      name: input.name,
      DOB: input.DOB,
    },
  });

  return patient;
}

export async function updatePatient(id, input, actor, db = getMysqlPool()) {
  const existing = await getPatient(id, db);

  const fields = [];
  const params = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name);
  }

  if (input.DOB !== undefined) {
    fields.push('DOB = ?');
    params.push(input.DOB);
  }

  if (!fields.length) {
    throw new ApiError(
      400,
      'NO_FIELDS',
      'At least one field is required'
    );
  }

  params.push(id);

  await db.execute(
    `UPDATE patient SET ${fields.join(', ')} WHERE patient_id = ?`,
    params
  );

  const patient = await getPatient(id, db);

  await writeAudit(db, {
    userId: actor.userId,
    action: 'PATIENT_UPDATED',
    entityType: 'PATIENT',
    entityId: id,
    details: {
      previousName: existing.name,
      previousDOB: existing.DOB,
      updatedFields: Object.keys(input),
    },
  });

  return patient;
}