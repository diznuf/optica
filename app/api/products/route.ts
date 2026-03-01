import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { productCreateSchema } from "@/lib/validators/product";
import { logAudit } from "@/lib/services/audit";
import { sanitizeProductForRole } from "@/lib/services/view";

import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "products", "read");
  if (auth.response) {
    return auth.response;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();

  const products = await db.product.findMany({
    where: q
      ? {
          OR: [{ name: { contains: q } }, { sku: { contains: q } }]
        }
      : undefined,
    include: {
      category: true,
      supplier: {
        select: { id: true, code: true, name: true }
      },
      stockLots: {
        select: { qtyRemaining: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const mapped = products.map((product) => {
    const qty = Number(product.stockLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0).toFixed(2));
    const base = {
      ...product,
      currentQty: qty
    };
    return sanitizeProductForRole(auth.session.role, base);
  });

  return ok(mapped);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "products", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, productCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const category = await db.productCategory.findUnique({ where: { id: body.data.categoryId } });
  if (!category) {
    return fail("Categorie introuvable", 404);
  }

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const product = await tx.product.create({
      data: {
        sku: body.data.sku,
        name: body.data.name,
        categoryId: body.data.categoryId,
        supplierId: body.data.supplierId || null,
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
        action: "PRODUCT_CREATE",
        entity: "Product",
        entityId: product.id,
        meta: { sku: product.sku }
      },
      tx
    );

    return product;
  });

  return ok(created, undefined, 201);
}
