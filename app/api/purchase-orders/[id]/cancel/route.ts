import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { cancelDocumentSchema } from "@/lib/validators/purchase-order";
import { logAudit } from "@/lib/services/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "purchasing", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, cancelDocumentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      invoices: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true }
      }
    }
  });

  if (!po) {
    return fail("Bon de commande introuvable", 404);
  }

  if (po.status === "CANCELLED") {
    return fail("Bon de commande deja annule", 409);
  }

  if (po.status === "RECEIVED") {
    return fail("Impossible d'annuler un bon deja receptionne", 409);
  }

  if (po.invoices.length > 0) {
    return fail("Impossible d'annuler: bon lie a des factures fournisseurs", 409);
  }

  const receiptCount = await db.stockMovement.count({
    where: {
      type: "IN",
      referenceType: "PURCHASE_ORDER",
      referenceId: po.id
    }
  });

  if (receiptCount > 0) {
    return fail("Impossible d'annuler: des receptions existent deja", 409);
  }

  const cancelNote = `[CANCEL ${new Date().toISOString()}] ${body.data.reason}`;

  const updated = await db.$transaction(async (tx) => {
    const record = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        notes: [po.notes, cancelNote].filter(Boolean).join("\n")
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PO_CANCEL",
        entity: "PurchaseOrder",
        entityId: id,
        meta: { from: po.status, to: "CANCELLED", reason: body.data.reason }
      },
      tx
    );

    return record;
  });

  return ok(updated);
}
