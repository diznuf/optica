import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { sanitizeProductForRole } from "@/lib/services/view";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "stock", "read");
  if (auth.response) {
    return auth.response;
  }

  const productId = request.nextUrl.searchParams.get("productId");

  const movements = await db.stockMovement.findMany({
    where: productId ? { productId } : undefined,
    include: {
      product: true,
      createdBy: {
        select: { id: true, displayName: true, username: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  if (auth.session.role === "VENDEUR") {
    const sanitized = movements.map((mv) => ({
      id: mv.id,
      productId: mv.productId,
      type: mv.type,
      qty: mv.qty,
      createdAt: mv.createdAt,
      product: sanitizeProductForRole(auth.session.role, mv.product),
      createdBy: mv.createdBy
    }));
    return ok(sanitized);
  }

  return ok(movements);
}
