import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { supplierReturnSchema } from "@/lib/validators/supplier-invoice";
import { nextSequence } from "@/lib/services/sequence";
import { recordStockMovement } from "@/lib/services/stock";
import { recomputeSupplierInvoice } from "@/lib/services/finance";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

function round2(value: number) {
  return Number(value.toFixed(2));
}

function aggregateQtyByProduct(items: Array<{ productId: string; qty: number }>) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.productId, round2((map.get(item.productId) ?? 0) + item.qty));
  }
  return map;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, supplierReturnSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const invoice = await db.supplierInvoice.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          productId: true,
          qty: true,
          unitCost: true
        }
      }
    }
  });
  if (!invoice) {
    return fail("Facture fournisseur introuvable", 404);
  }

  if (invoice.status === "CANCELLED") {
    return fail("Facture annulee", 409);
  }

  const invoiceQtyByProduct = aggregateQtyByProduct(invoice.items);
  const invoiceValueByProduct = invoice.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = round2((acc[item.productId] ?? 0) + item.qty * item.unitCost);
    return acc;
  }, {});
  const incomingQtyByProduct = aggregateQtyByProduct(body.data.items);

  for (const productId of incomingQtyByProduct.keys()) {
    if (!invoiceQtyByProduct.has(productId)) {
      return fail("Produit de retour absent de la facture fournisseur", 409);
    }
  }

  const existingReturnIds = await db.supplierReturn.findMany({
    where: { supplierInvoiceId: id, status: { not: "CANCELLED" } },
    select: { id: true }
  });

  const alreadyReturnedByProduct = new Map<string, number>();
  if (existingReturnIds.length) {
    const returnedMovements = await db.stockMovement.findMany({
      where: {
        type: "RETURN_SUPPLIER",
        referenceType: "SUPPLIER_RETURN",
        referenceId: { in: existingReturnIds.map((ret) => ret.id) }
      },
      select: {
        productId: true,
        qty: true
      }
    });

    for (const movement of returnedMovements) {
      alreadyReturnedByProduct.set(
        movement.productId,
        round2((alreadyReturnedByProduct.get(movement.productId) ?? 0) + movement.qty)
      );
    }
  }

  let maxAmountByItems = 0;
  for (const [productId, incomingQty] of incomingQtyByProduct.entries()) {
    const invoicedQty = invoiceQtyByProduct.get(productId) ?? 0;
    const alreadyReturnedQty = alreadyReturnedByProduct.get(productId) ?? 0;
    const nextReturnedQty = round2(alreadyReturnedQty + incomingQty);

    if (nextReturnedQty > invoicedQty) {
      return fail("Quantite retour depasse la quantite facturee", 409);
    }

    const avgUnitCost = round2((invoiceValueByProduct[productId] ?? 0) / Math.max(0.01, invoicedQty));
    maxAmountByItems += incomingQty * avgUnitCost;
  }
  maxAmountByItems = round2(maxAmountByItems);

  if (body.data.amount > maxAmountByItems) {
    return fail("Montant retour depasse la valeur des articles retournes", 409);
  }

  if (body.data.amount > invoice.balance) {
    return fail("Montant retour depasse le solde facture", 409);
  }

  const newTotal = round2(invoice.totalAmount - body.data.amount);
  if (newTotal < invoice.paidAmount) {
    return fail("Montant retour invalide: inferieur au deja paye", 409);
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const number = await nextSequence("SUPPLIER_RETURN", tx);
    const supplierReturn = await tx.supplierReturn.create({
      data: {
        number,
        supplierId: invoice.supplierId,
        supplierInvoiceId: id,
        date: new Date(body.data.date),
        amount: body.data.amount,
        note: body.data.note,
        status: "CONFIRMED"
      }
    });

    for (const item of body.data.items) {
      await recordStockMovement({
        tx,
        productId: item.productId,
        type: "RETURN_SUPPLIER",
        qty: item.qty,
        referenceType: "SUPPLIER_RETURN",
        referenceId: supplierReturn.id,
        note: `Retour ${number}`,
        createdById: auth.session.userId
      });
    }

    await tx.supplierInvoice.update({
      where: { id },
      data: { totalAmount: newTotal }
    });

    const updatedInvoice = await recomputeSupplierInvoice(id, tx);

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_RETURN_CREATE",
        entity: "SupplierReturn",
        entityId: supplierReturn.id,
        meta: { invoiceId: id, amount: body.data.amount }
      },
      tx
    );

    return { supplierReturn, invoice: updatedInvoice };
  });

  return ok(result, undefined, 201);
}
