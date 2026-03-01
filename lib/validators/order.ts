import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().optional(),
  descriptionSnapshot: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  prescriptionSnapshotJson: z.record(z.any()).optional()
});

export const orderCreateSchema = z.object({
  patientId: z.string().min(1),
  orderDate: z.string().datetime(),
  promisedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1)
});

export const orderStatusSchema = z.object({
  status: z.enum(["BROUILLON", "CONFIRMEE", "EN_ATELIER", "PRETE", "LIVREE", "ANNULEE"]),
  note: z.string().optional()
});

export const customerPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  paidAt: z.string().datetime(),
  reference: z.string().optional()
});

export const cancelPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
