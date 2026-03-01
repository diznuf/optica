import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  const products = await db.product.findMany({
    include: {
      category: true,
      stockLots: {
        select: { qtyRemaining: true }
      }
    }
  });

  const lowStock = products
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category.name,
      reorderLevel: product.reorderLevel,
      currentQty: Number(product.stockLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0).toFixed(2))
    }))
    .filter((product) => product.currentQty <= product.reorderLevel)
    .sort((a, b) => a.currentQty - b.currentQty);

  return ok(lowStock);
}