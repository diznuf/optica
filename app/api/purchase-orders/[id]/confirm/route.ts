import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { logAudit } from "@/lib/services/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "purchasing", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po) {
    return fail("Bon de commande introuvable", 404);
  }

  if (po.status !== "DRAFT") {
    return fail("Seul un bon en brouillon peut etre confirme", 409);
  }

  const updated = await db.$transaction(async (tx) => {
    const record = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "CONFIRMED" }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PO_CONFIRM",
        entity: "PurchaseOrder",
        entityId: id
      },
      tx
    );

    return record;
  });

  return ok(updated);
}