import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { cancelDocumentSchema } from "@/lib/validators/supplier-invoice";
import { recomputeSupplierInvoice } from "@/lib/services/finance";
import { recordStockMovement } from "@/lib/services/stock";
import { logAudit } from "@/lib/services/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, cancelDocumentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const { id } = await params;
  const supplierReturn = await db.supplierReturn.findUnique({
    where: { id }
  });

  if (!supplierReturn) {
    return fail("Retour fournisseur introuvable", 404);
  }

  if (supplierReturn.status === "CANCELLED") {
    return fail("Retour fournisseur deja annule", 409);
  }

  const linkedMovements = await db.stockMovement.findMany({
    where: {
      type: "RETURN_SUPPLIER",
      referenceType: "SUPPLIER_RETURN",
      referenceId: supplierReturn.id
    },
    select: {
      productId: true,
      qty: true,
      unitCost: true
    }
  });

  const cancelNote = `[CANCEL ${new Date().toISOString()}] ${body.data.reason}`;

  const result = await db.$transaction(async (tx) => {
    if (supplierReturn.status === "CONFIRMED") {
      if (linkedMovements.length > 0) {
        const productIds = Array.from(new Set(linkedMovements.map((movement) => movement.productId)));
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, buyPrice: true }
        });
        const buyPriceByProduct = new Map(products.map((product) => [product.id, product.buyPrice]));

        for (const movement of linkedMovements) {
          const resolvedCost = movement.unitCost ?? buyPriceByProduct.get(movement.productId) ?? 0;
          await recordStockMovement({
            tx,
            productId: movement.productId,
            type: "ADJUST",
            qty: movement.qty,
            unitCost: resolvedCost,
            referenceType: "SUPPLIER_RETURN_CANCEL",
            referenceId: supplierReturn.id,
            note: `Annulation retour ${supplierReturn.number}`,
            createdById: auth.session.userId
          });
        }
      }

      if (supplierReturn.supplierInvoiceId) {
        await tx.supplierInvoice.update({
          where: { id: supplierReturn.supplierInvoiceId },
          data: {
            totalAmount: { increment: supplierReturn.amount }
          }
        });

        await recomputeSupplierInvoice(supplierReturn.supplierInvoiceId, tx);
      }
    }

    const cancelledReturn = await tx.supplierReturn.update({
      where: { id: supplierReturn.id },
      data: {
        status: "CANCELLED",
        note: [supplierReturn.note, cancelNote].filter(Boolean).join("\n")
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_RETURN_CANCEL",
        entity: "SupplierReturn",
        entityId: supplierReturn.id,
        meta: { reason: body.data.reason }
      },
      tx
    );

    return cancelledReturn;
  });

  return ok(result);
}
