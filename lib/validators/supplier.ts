import { z } from "zod";

export const supplierCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  paymentTermsDays: z.number().int().positive().default(30),
  openingBalance: z.number().default(0),
  isActive: z.boolean().optional().default(true)
});

export const supplierUpdateSchema = supplierCreateSchema.partial();