import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(10).default("change-me-in-production"),
  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(14)
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  BACKUP_DIR: process.env.BACKUP_DIR,
  BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS
});