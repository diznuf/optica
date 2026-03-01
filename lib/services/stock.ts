import { Prisma, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { consumeFifo } from "@/lib/services/fifo";

export async function currentProductQuantity(productId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const client = tx ?? db;
  const result = await client.stockLot.aggregate({
    where: { productId },
    _sum: { qtyRemaining: true }
  });

  return Number((result._sum.qtyRemaining ?? 0).toFixed(2));
}

export async function recordStockMovement(params: {
  tx: Prisma.TransactionClient;
  productId: string;
  type: StockMovementType;
  qty: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdById: string;
}) {
  const { tx, productId, type, qty, unitCost, referenceType, referenceId, note, createdById } = params;

  let resolvedCost = unitCost;

  if (type === "IN") {
    if (unitCost === undefined) {
      throw new Error("unitCost requis pour entree stock");
    }
    await tx.stockLot.create({
      data: {
        productId,
        sourceType: referenceType ?? "MANUAL",
        sourceId: referenceId,
        qtyIn: qty,
        qtyRemaining: qty,
        unitCost
      }
    });
    resolvedCost = unitCost;
  }

  if (type === "OUT" || type === "RETURN_SUPPLIER") {
    const fifo = await consumeFifo(tx, productId, qty);
    resolvedCost = Number((fifo.consumedCost / qty).toFixed(2));
  }

  if (type === "ADJUST") {
    if (unitCost === undefined) {
      resolvedCost = undefined;
    } else {
      await tx.stockLot.create({
        data: {
          productId,
          sourceType: referenceType ?? "ADJUST",
          sourceId: referenceId,
          qtyIn: qty,
          qtyRemaining: qty,
          unitCost
        }
      });
      resolvedCost = unitCost;
    }
  }

  return tx.stockMovement.create({
    data: {
      productId,
      type,
      qty,
      unitCost: resolvedCost,
      referenceType,
      referenceId,
      note,
      createdById
    }
  });
}