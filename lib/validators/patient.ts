import { z } from "zod";

export const patientCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  birthDate: z.string().datetime().optional(),
  address: z.string().optional(),
  notes: z.string().optional()
});

export const patientUpdateSchema = patientCreateSchema.partial();