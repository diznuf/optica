import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { productUpdateSchema } from "@/lib/validators/product";
import { sanitizeProductForRole } from "@/lib/services/view";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "products", "read");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: true,
      supplier: {
        select: { id: true, code: true, name: true }
      },
      stockLots: { select: { qtyRemaining: true } }
    }
  });

  if (!product) {
    return fail("Produit introuvable", 404);
  }

  const qty = Number(product.stockLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0).toFixed(2));
  return ok(sanitizeProductForRole(auth.session.role, { ...product, currentQty: qty }));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "products", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, productUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    return fail("Produit introuvable", 404);
  }

  const updated = await db.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: {
        sku: body.data.sku,
        name: body.data.name,
        categoryId: body.data.categoryId,
        supplierId: body.data.supplierId,
        unit: body.data.unit,
        buyPrice: body.data.buyPrice,
        sellPrice: body.data.sellPrice,
        reorderLevel: body.data.reorderLevel,
        isActive: body.data.isActive
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PRODUCT_UPDATE",
        entity: "Product",
        entityId: id
      },
      tx
    );

    return product;
  });

  return ok(updated);
}
