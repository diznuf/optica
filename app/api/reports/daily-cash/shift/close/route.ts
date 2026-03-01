import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { cashShiftCloseSchema } from "@/lib/validators/cash-shift";
import { logAudit } from "@/lib/services/audit";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (!["ADMIN", "VENDEUR"].includes(auth.session.role)) {
    return fail("Acces refuse", 403);
  }

  const body = await parseBody(request, cashShiftCloseSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const openShift = await db.cashShift.findFirst({
    where: {
      userId: auth.session.userId,
      status: "OPEN"
    },
    orderBy: { openedAt: "desc" }
  });

  if (!openShift) {
    return fail("Aucune caisse ouverte a cloturer", 409);
  }

  const closedAt = new Date();

  const result = await db.$transaction(async (tx) => {
    const cashSum = await tx.customerPayment.aggregate({
      where: {
        createdById: auth.session.userId,
        method: "CASH",
        paidAt: { gte: openShift.openedAt, lte: closedAt }
      },
      _sum: { amount: true },
      _count: { _all: true }
    });

    const cashCollected = round2(cashSum._sum.amount ?? 0);
    const expectedCash = round2(openShift.openingCash + cashCollected);
    const closingCashDeclared = round2(body.data.closingCashDeclared);
    const variance = round2(closingCashDeclared - expectedCash);

    const updated = await tx.cashShift.update({
      where: { id: openShift.id },
      data: {
        status: "CLOSED",
        closedAt,
        closingCashDeclared,
        expectedCash,
        variance,
        note: [openShift.note, body.data.note].filter(Boolean).join("\n") || null
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "CASH_SHIFT_CLOSE",
        entity: "CashShift",
        entityId: openShift.id,
        meta: {
          openingCash: openShift.openingCash,
          cashCollected,
          expectedCash,
          closingCashDeclared,
          variance
        }
      },
      tx
    );

    return {
      shift: updated,
      summary: {
        openingCash: openShift.openingCash,
        cashCollected,
        expectedCash,
        closingCashDeclared,
        variance,
        paymentsCount: cashSum._count._all
      }
    };
  });

  return ok(result);
}
