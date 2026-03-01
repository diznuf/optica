import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type AuditParams = {
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
};

export async function logAudit(params: AuditParams, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      metaJson: params.meta ? (params.meta as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });
}
