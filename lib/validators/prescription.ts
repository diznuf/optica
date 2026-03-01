import { z } from "zod";

export const contactLensFitSchema = z.object({
  eye: z.enum(["OD", "OS"]),
  brand: z.string().optional(),
  power: z.number().min(-30).max(30).optional(),
  baseCurve: z.number().min(5).max(12).optional(),
  diameter: z.number().min(10).max(20).optional(),
  notes: z.string().optional()
});

const prescriptionPayloadSchema = z.object({
  examDate: z.string().datetime(),
  odSph: z.number().min(-30).max(30).optional(),
  odCyl: z.number().min(-20).max(20).optional(),
  odAxis: z.number().int().min(0).max(180).optional(),
  odAdd: z.number().min(0).max(10).optional(),
  osSph: z.number().min(-30).max(30).optional(),
  osCyl: z.number().min(-20).max(20).optional(),
  osAxis: z.number().int().min(0).max(180).optional(),
  osAdd: z.number().min(0).max(10).optional(),
  pdFar: z.number().min(40).max(90).optional(),
  pdNear: z.number().min(40).max(90).optional(),
  prism: z.string().optional(),
  notes: z.string().optional(),
  contactFits: z.array(contactLensFitSchema).optional().default([])
});

export const prescriptionCreateSchema = prescriptionPayloadSchema.extend({
  patientId: z.string().min(1)
});

export const prescriptionUpdateSchema = prescriptionPayloadSchema.partial();
