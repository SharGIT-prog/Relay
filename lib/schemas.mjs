import { z } from 'zod';
import { idNumber, idQuery, dateTime, dateOnly } from './validate.mjs';

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
}).strict();

export const DISCHARGE_STATUSES = ['PLANNED', 'READY', 'COMPLETED', 'CANCELLED'];
export const RESOURCE_AVAILABILITY = ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'];

export const createDischargePlanSchema = z.object({
  admissionId: idNumber,
  doctorId: idNumber,
  dischargeDate: dateTime,
  destinationFacilityId: idNumber.nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
}).strict();

export const patchDischargePlanSchema = z.object({
  doctorId: idNumber.optional(),
  dischargeDate: dateTime.optional(),
  destinationFacilityId: idNumber.nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  status: z.enum(DISCHARGE_STATUSES).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

const resourceType = z.string().trim().min(1).max(100);

export const resourcesQuerySchema = z.object({
  resourceType: resourceType.optional(),
  facilityId: idQuery.optional(),
  availability: z.enum(RESOURCE_AVAILABILITY).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

export const availableResourcesQuerySchema = z.object({
  start: dateTime,
  end: dateTime,
  resourceType: resourceType.optional(),
  facilityId: idQuery.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict().refine((o) => o.end > o.start, { message: 'end must be after start', path: ['end'] });

export const allocateResourceSchema = z.object({
  admissionId: idNumber,
  resourceId: idNumber,
  startTime: dateTime,
  endTime: dateTime,
  requirementId: idNumber.nullable().optional(),
}).strict().refine((o) => o.endTime > o.startTime, { message: 'endTime must be after startTime', path: ['endTime'] });

export const allocationStatusSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
}).strict();

const nonEmpty = (o) => Object.keys(o).length > 0;
const requiredForm = z.string().trim().min(1).max(200);

export const createRequirementSchema = z.object({
  dischargeId: idNumber,
  recoveryId: idNumber,
  resourceType,
  requiredForm: requiredForm.nullable().optional(),
  requiredUntil: dateTime.nullable().optional(),
}).strict();

export const patchRequirementSchema = z.object({
  resourceType: resourceType.optional(),
  requiredForm: requiredForm.nullable().optional(),
  requiredUntil: dateTime.nullable().optional(),
  status: z.enum(['PENDING', 'FULFILLED', 'CANCELLED']).optional(),
}).strict().refine(nonEmpty, { message: 'At least one field is required' });

export const createRecoveryEpisodeSchema = z.object({
  patientId: idNumber,
  facilityId: idNumber,
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  status: z.enum(['PLANNED', 'ACTIVE']).default('PLANNED'),
}).strict().refine((o) => o.endDate == null || o.endDate >= o.startDate,
  { message: 'endDate cannot be before startDate', path: ['endDate'] });

export const createHandoffSchema = z.object({
  dischargeId: idNumber,
  handoffDate: dateTime,
}).strict();