import { z } from "zod";

export const cashShiftOpenSchema = z.object({
  openingCash: z.number().nonnegative().optional().default(0),
  note: z.string().trim().max(500).optional()
});

export const cashShiftCloseSchema = z.object({
  closingCashDeclared: z.number().nonnegative(),
  note: z.string().trim().max(500).optional()
});
