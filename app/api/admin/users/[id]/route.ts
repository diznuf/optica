import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { userUpdateSchema } from "@/lib/validators/user";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "users", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, userUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) {
    return fail("Utilisateur introuvable", 404);
  }

  const passwordHash = body.data.password ? await hashPassword(body.data.password) : undefined;

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        username: body.data.username,
        displayName: body.data.displayName,
        role: body.data.role,
        isActive: body.data.isActive,
        passwordHash
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        updatedAt: true
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "USER_UPDATE",
        entity: "User",
        entityId: id
      },
      tx
    );

    return user;
  });

  return ok(updated);
}