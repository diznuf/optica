import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { recordStockMovement } from "@/lib/services/stock";
import { logAudit } from "@/lib/services/audit";
import { purchaseOrderReceiveSchema } from "@/lib/validators/purchase-order";

import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "purchasing", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!po) {
    return fail("Bon de commande introuvable", 404);
  }

  if (!["CONFIRMED", "RECEIVED"].includes(po.status)) {
    return fail("Le bon doit etre confirme avant reception", 409);
  }

  const rawBody = await request.text();
  let jsonBody: unknown = {};
  if (rawBody) {
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return fail("Payload invalide", 400);
    }
  }

  const parsedBody = purchaseOrderReceiveSchema.safeParse(jsonBody);
  if (!parsedBody.success) {
    return fail(parsedBody.error.issues[0]?.message ?? "Payload invalide", 400);
  }

  try {
    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const receivedMovements = await tx.stockMovement.findMany({
        where: {
          type: "IN",
          referenceType: "PURCHASE_ORDER",
          referenceId: po.id
        },
        select: {
          productId: true,
          qty: true
        }
      });

    const receivedByProduct = receivedMovements.reduce<Record<string, number>>((acc, movement) => {
      acc[movement.productId] = (acc[movement.productId] ?? 0) + movement.qty;
      return acc;
    }, {});

    const lineByProduct = new Map(po.items.map((item) => [item.productId, item]));
    const remainingByProduct = new Map(
      po.items.map((item) => {
        const receivedQty = Number((receivedByProduct[item.productId] ?? 0).toFixed(2));
        return [item.productId, Number(Math.max(0, item.qty - receivedQty).toFixed(2))];
      })
    );

    const hasRemaining = Array.from(remainingByProduct.values()).some((remaining) => remaining > 0);
    if (!hasRemaining) {
      throw new Error("Le bon est deja totalement receptionne");
    }

    const receiveItems =
      parsedBody.data.items && parsedBody.data.items.length > 0
        ? parsedBody.data.items
        : Array.from(remainingByProduct.entries())
            .filter(([, remaining]) => remaining > 0)
            .map(([productId, remaining]) => ({ productId, qty: remaining }));

    const receiptRows: Array<{ productId: string; qty: number; unitCost: number }> = [];

    for (const row of receiveItems) {
      const line = lineByProduct.get(row.productId);
      if (!line) {
        throw new Error("Produit non present dans le bon de commande");
      }

      const remaining = remainingByProduct.get(row.productId) ?? 0;
      if (row.qty > remaining) {
        throw new Error("Quantite recue depasse le restant du bon");
      }

      if (row.qty <= 0) {
        continue;
      }

      receiptRows.push({
        productId: row.productId,
        qty: row.qty,
        unitCost: line.unitCost
      });
    }

    if (!receiptRows.length) {
      throw new Error("Aucune quantite a receptionner");
    }

    for (const row of receiptRows) {
      await recordStockMovement({
        tx,
        productId: row.productId,
        type: "IN",
        qty: row.qty,
        unitCost: row.unitCost,
        referenceType: "PURCHASE_ORDER",
        referenceId: po.id,
        note: `Reception ${po.number}`,
        createdById: auth.session.userId
      });
    }

    const newReceivedByProduct = { ...receivedByProduct };
    for (const row of receiptRows) {
      newReceivedByProduct[row.productId] = (newReceivedByProduct[row.productId] ?? 0) + row.qty;
    }

    const allReceived = po.items.every((item) => {
      const received = Number((newReceivedByProduct[item.productId] ?? 0).toFixed(2));
      return received >= item.qty;
    });

    const poUpdated = await tx.purchaseOrder.update({
      where: { id },
      data: { status: allReceived ? "RECEIVED" : "CONFIRMED" }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PO_RECEIVE",
        entity: "PurchaseOrder",
        entityId: id,
        meta: {
          itemCount: receiptRows.length,
          rows: receiptRows,
          status: poUpdated.status
        }
      },
      tx
    );

    const summary = po.items.map((item) => {
      const receivedQty = Number((newReceivedByProduct[item.productId] ?? 0).toFixed(2));
      const remainingQty = Number(Math.max(0, item.qty - receivedQty).toFixed(2));
      return {
        productId: item.productId,
        orderedQty: item.qty,
        receivedQty,
        remainingQty
      };
    });

      return { po: poUpdated, summary };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erreur reception bon de commande", 400);
  }
}
