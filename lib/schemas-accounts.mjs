import { z } from 'zod';

const nonEmpty = (o) => Object.keys(o).length > 0;

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128)
    .regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a digit'),
}).strict();

export const usersQuerySchema = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE']).optional() }).strict();

export const adminPatchUserSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  role: z.enum(['ADMIN', 'CARE_COORDINATOR']).optional(),
}).strict().refine(nonEmpty, { message: 'At least one field is required' });

export const facilityBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  facilityType: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(500),
  contactNumber: z.string().trim().min(1).max(20),
}).strict();

export const doctorBodySchema = z.object({
  name: z.string().trim().min(1).max(150),
  specialisation: z.string().trim().min(1).max(120),
  contactNumber: z.string().trim().min(1).max(20),
}).strict();
export const doctorPatchSchema = doctorBodySchema.partial().strict().refine(nonEmpty, { message: 'At least one field is required' });

export const doctorsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const lookupAdmissionsQuerySchema = z.object({ patientId: z.coerce.number().int().positive() }).strict();