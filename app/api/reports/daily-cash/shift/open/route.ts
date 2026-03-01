import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { cashShiftOpenSchema } from "@/lib/validators/cash-shift";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (!["ADMIN", "VENDEUR"].includes(auth.session.role)) {
    return fail("Acces refuse", 403);
  }

  const body = await parseBody(request, cashShiftOpenSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existingOpen = await db.cashShift.findFirst({
    where: {
      userId: auth.session.userId,
      status: "OPEN"
    },
    orderBy: { openedAt: "desc" }
  });

  if (existingOpen) {
    return fail("Une caisse est deja ouverte pour cet utilisateur", 409);
  }

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const shift = await tx.cashShift.create({
      data: {
        userId: auth.session.userId,
        openingCash: body.data.openingCash,
        note: body.data.note || null
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "CASH_SHIFT_OPEN",
        entity: "CashShift",
        entityId: shift.id,
        meta: { openingCash: shift.openingCash }
      },
      tx
    );

    return shift;
  });

  return ok(created, undefined, 201);
}
