import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "purchasing", "read");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        include: {
          product: true
        }
      }
    }
  });

  if (!po) {
    return fail("Bon de commande introuvable", 404);
  }

  const stockIns = await db.stockMovement.findMany({
    where: {
      type: "IN",
      referenceType: "PURCHASE_ORDER",
      referenceId: po.id
    },
    select: {
      productId: true,
      qty: true,
      createdAt: true,
      id: true,
      note: true
    },
    orderBy: { createdAt: "desc" }
  });

  const receivedByProduct = stockIns.reduce<Record<string, number>>((acc, mv) => {
    acc[mv.productId] = (acc[mv.productId] ?? 0) + mv.qty;
    return acc;
  }, {});

  const items = po.items.map((item) => {
    const receivedQty = Number((receivedByProduct[item.productId] ?? 0).toFixed(2));
    const remainingQty = Number(Math.max(0, item.qty - receivedQty).toFixed(2));

    return {
      ...item,
      receivedQty,
      remainingQty
    };
  });

  const orderedQty = Number(items.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
  const receivedQty = Number(items.reduce((sum, item) => sum + item.receivedQty, 0).toFixed(2));

  return ok({
    ...po,
    items,
    summary: {
      orderedQty,
      receivedQty,
      remainingQty: Number(Math.max(0, orderedQty - receivedQty).toFixed(2))
    },
    receptions: stockIns
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "purchasing", "delete");
  if (auth.response) {
    return auth.response;
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

  if (po.status !== "DRAFT") {
    return fail("Suppression autorisee seulement pour bon de commande brouillon", 409);
  }

  if (po.invoices.length > 0) {
    return fail("Suppression impossible: bon lie a des factures fournisseurs", 409);
  }

  await db.$transaction(async (tx) => {
    await tx.purchaseOrder.delete({ where: { id } });
    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PO_DELETE",
        entity: "PurchaseOrder",
        entityId: id
      },
      tx
    );
  });

  return ok({ deleted: true });
}
