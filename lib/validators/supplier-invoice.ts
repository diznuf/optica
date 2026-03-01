import { z } from "zod";

export const supplierInvoiceItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative()
});

export const supplierInvoiceCreateSchema = z.object({
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional(),
  issueDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
  items: z.array(supplierInvoiceItemSchema).min(1)
});

export const supplierPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  paidAt: z.string().datetime(),
  reference: z.string().optional()
});

export const supplierReturnSchema = z.object({
  date: z.string().datetime(),
  amount: z.number().positive(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().positive()
      })
    )
    .min(1)
});

export const cancelDocumentSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
