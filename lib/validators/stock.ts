import { z } from "zod";

export const stockMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["IN", "OUT", "ADJUST", "RETURN_SUPPLIER"]),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  note: z.string().optional()
});