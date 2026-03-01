import { z } from "zod";

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative()
});

export const purchaseOrderCreateSchema = z.object({
  supplierId: z.string().min(1),
  orderDate: z.string().datetime(),
  expectedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemSchema).min(1)
});

export const purchaseOrderReceiveSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().positive()
      })
    )
    .min(1)
    .optional()
});

export const cancelDocumentSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
