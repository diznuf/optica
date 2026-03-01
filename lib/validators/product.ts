import { z } from "zod";

export const productCreateSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  supplierId: z.string().optional(),
  unit: z.string().min(1),
  buyPrice: z.number().nonnegative(),
  sellPrice: z.number().nonnegative(),
  reorderLevel: z.number().nonnegative().default(0),
  isActive: z.boolean().optional().default(true)
});

export const productUpdateSchema = productCreateSchema.partial();