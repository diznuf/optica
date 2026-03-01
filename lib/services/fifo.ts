import { Prisma } from "@prisma/client";

type ConsumeResult = {
  consumedCost: number;
  lotsUsed: Array<{ lotId: string; qty: number; unitCost: number }>;
};

export async function consumeFifo(
  tx: Prisma.TransactionClient,
  productId: string,
  qty: number
): Promise<ConsumeResult> {
  const lots = await tx.stockLot.findMany({
    where: { productId, qtyRemaining: { gt: 0 } },
    orderBy: { receivedAt: "asc" }
  });

  let remaining = qty;
  let consumedCost = 0;
  const lotsUsed: ConsumeResult["lotsUsed"] = [];

  for (const lot of lots) {
    if (remaining <= 0) {
      break;
    }

    const consumeQty = Math.min(lot.qtyRemaining, remaining);
    remaining -= consumeQty;
    consumedCost += consumeQty * lot.unitCost;

    await tx.stockLot.update({
      where: { id: lot.id },
      data: { qtyRemaining: { decrement: consumeQty } }
    });

    lotsUsed.push({ lotId: lot.id, qty: consumeQty, unitCost: lot.unitCost });
  }

  if (remaining > 0) {
    throw new Error("Stock insuffisant pour la sortie FIFO");
  }

  return {
    consumedCost: Number(consumedCost.toFixed(2)),
    lotsUsed
  };
}