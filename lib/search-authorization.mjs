import { getMysqlPool } from './db-mysql.mjs';
import { SearchError } from './search.mjs';

export const SEARCH_ROLES = ['ADMIN', 'CARE_COORDINATOR'];

export async function resolveSearchUser(userId, db = getMysqlPool()) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new SearchError('USER_NOT_ALLOWED', 'Unknown or inactive user');
  const [users] = await db.execute('SELECT user_id, name, status FROM app_user WHERE user_id = ?', [id]);
  if (!users.length || users[0].status !== 'ACTIVE') throw new SearchError('USER_NOT_ALLOWED', 'Unknown or inactive user');
  const [roles] = await db.execute(
    'SELECT r.role_name FROM user_role ur JOIN `role` r ON r.role_id = ur.role_id WHERE ur.user_id = ?', [id]);
  const roleNames = roles.map((r) => r.role_name);
  if (!roleNames.some((r) => SEARCH_ROLES.includes(r))) {
    throw new SearchError('USER_NOT_ALLOWED', 'The user has no role permitted to search documents');
  }
  return { userId: id, name: users[0].name, roles: roleNames };
}

function positiveInt(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new SearchError('INVALID_FILTER', `${name} must be a positive integer`);
  return n;
}

/** Returns curr. MySQL records of every document this user may search with these filters. */
export async function getAuthorizedDocuments(user, filters = {}, db = getMysqlPool()) {
  const patientId = positiveInt(filters.patientId, 'patientId');
  const admissionId = positiveInt(filters.admissionId, 'admissionId');
  const recoveryId = positiveInt(filters.recoveryId, 'recoveryId');
  let documentType;
  if (filters.documentType !== undefined && filters.documentType !== null && filters.documentType !== '') {
    if (typeof filters.documentType !== 'string' || filters.documentType.length > 60) {
      throw new SearchError('INVALID_FILTER', 'documentType must be a string of at most 60 characters');
    }
    documentType = filters.documentType;
  }

  // Only fixed SQL fragments are appended - every value travels as bound parameter.
  let sql = `SELECT d.document_id, d.patient_id, p.name AS patient_name, d.admission_id, d.recovery_id,
                    d.document_type, d.title, d.source, d.status, d.created_at
             FROM care_document d
             JOIN patient p ON p.patient_id = d.patient_id
             WHERE d.status = 'APPROVED'`;
  const params = [];
  if (patientId !== undefined)   { sql += ' AND d.patient_id = ?';   params.push(patientId); }
  if (admissionId !== undefined) { sql += ' AND d.admission_id = ?'; params.push(admissionId); }
  if (recoveryId !== undefined)  { sql += ' AND d.recovery_id = ?';  params.push(recoveryId); }
  if (documentType !== undefined){ sql += ' AND d.document_type = ?';params.push(documentType); }
  sql += ' ORDER BY d.document_id';

  const [rows] = await db.execute(sql, params);
  return rows;
}