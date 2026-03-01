import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { restoreBackup } from "@/lib/services/backup";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";

const schema = z.object({
  backupId: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  dryRun: z.boolean().optional().default(false),
  confirmation: z.string().optional()
}).refine((value) => value.backupId || value.filePath, {
  message: "backupId ou filePath requis"
});

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "backups", "manage");
  if (auth.response) {
    return auth.response;
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Payload invalide", 400);
  }

  try {
    let filePath = parsed.data.filePath ?? "";
    let expectedSizeBytes: number | undefined;
    let expectedChecksumSha256: string | null | undefined;
    let backupRecordId = parsed.data.backupId ?? null;

    if (parsed.data.backupId) {
      const record = await db.backupRecord.findUnique({
        where: { id: parsed.data.backupId }
      });
      if (!record) {
        return fail("Backup introuvable", 404);
      }
      if (record.status !== "SUCCESS") {
        return fail("Le backup selectionne est invalide", 409);
      }
      filePath = record.filePath;
      expectedSizeBytes = record.sizeBytes;
      expectedChecksumSha256 = record.checksumSha256;
      backupRecordId = record.id;
    }

    if (!parsed.data.dryRun && parsed.data.confirmation !== "RESTORE") {
      return fail("Confirmation RESTORE requise", 400);
    }

    const restoreResult = await restoreBackup(filePath, {
      expectedSizeBytes,
      expectedChecksumSha256,
      dryRun: parsed.data.dryRun
    });

    await db.$transaction(async (tx) => {
      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: parsed.data.dryRun ? "BACKUP_RESTORE_VALIDATE" : "BACKUP_RESTORE",
          entity: "BackupRecord",
          entityId: backupRecordId ?? filePath,
          meta: {
            backupId: backupRecordId,
            filePath,
            dryRun: parsed.data.dryRun
          }
        },
        tx
      );
    });

    return ok({
      valid: true,
      ...restoreResult
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Restauration echouee", 409);
  }
}
