import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { runBackupAndRecord } from "@/lib/services/backup";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "backups", "manage");
  if (auth.response) {
    return auth.response;
  }

  const result = await runBackupAndRecord();
  if (!result.success) {
    return fail(result.error ?? "Backup echoue", 500);
  }
  const recordId = result.recordId ?? "";
  if (!recordId) {
    return fail("Backup cree sans enregistrement", 500);
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "BACKUP_CREATE",
        entity: "BackupRecord",
        entityId: recordId,
        meta: {
          filePath: result.filePath,
          sizeBytes: result.sizeBytes,
          checksumSha256: result.checksumSha256
        }
      },
      tx
    );
  });

  return ok(result, undefined, 201);
}
