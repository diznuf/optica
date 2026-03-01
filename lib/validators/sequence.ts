import { z } from "zod";

export const sequenceUpdateSchema = z.object({
  currentValue: z.number().int().min(0),
  force: z.boolean().optional().default(false)
});
