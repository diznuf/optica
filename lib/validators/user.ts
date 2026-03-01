import { z } from "zod";

export const userCreateSchema = z.object({
  username: z.string().min(3),
  displayName: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "OPTICIEN", "GESTIONNAIRE_STOCK", "VENDEUR"]),
  isActive: z.boolean().optional().default(true)
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional()
});