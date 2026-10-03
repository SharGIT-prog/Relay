export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MYSQL_ERRNO = {
  50001: [422, 'INVALID_TIME_RANGE'],
  50002: [404, 'RESOURCE_NOT_FOUND'],
  50003: [409, 'RESOURCE_NOT_AVAILABLE'],
  50004: [404, 'ADMISSION_NOT_FOUND'],
  50005: [404, 'REQUIREMENT_NOT_FOUND'],
  50006: [409, 'REQUIREMENT_CLOSED'],
  50007: [422, 'REQUIREMENT_ADMISSION_MISMATCH'],
  50008: [422, 'RESOURCE_TYPE_MISMATCH'],
  50009: [409, 'RESOURCE_CONFLICT'],
  1452: [422, 'REFERENCE_NOT_FOUND', 'A referenced record does not exist'],
  3819: [422, 'CONSTRAINT_VIOLATION', 'A value violates a database constraint'],
  1451: [409, 'REFERENCED_BY_OTHER_RECORDS', 'The record is referenced by other records'],
  1062: [409, 'DUPLICATE', 'A record with the same unique value already exists'],
};

export function toApiError(e) {
  if (e instanceof ApiError) return e;
  const m = MYSQL_ERRNO[e?.errno];
  if (!m) return null;
  return new ApiError(m[0], m[1], e.errno >= 50000 ? e.sqlMessage : m[2]);
}