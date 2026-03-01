import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { stockMovementSchema } from "@/lib/validators/stock";
import { recordStockMovement } from "@/lib/services/stock";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "stock", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, stockMovementSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const product = await db.product.findUnique({ where: { id: body.data.productId } });
  if (!product) {
    return fail("Produit introuvable", 404);
  }

  try {
    const movement = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await recordStockMovement({
        tx,
        productId: body.data.productId,
        type: body.data.type,
        qty: body.data.qty,
        unitCost: body.data.unitCost,
        referenceType: body.data.referenceType,
        referenceId: body.data.referenceId,
        note: body.data.note,
        createdById: auth.session.userId
      });

      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: "STOCK_MOVEMENT_CREATE",
          entity: "StockMovement",
          entityId: created.id,
          meta: {
            type: body.data.type,
            qty: body.data.qty,
            productId: body.data.productId
          }
        },
        tx
      );

      return created;
    });

    return ok(movement, undefined, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erreur mouvement stock", 400);
  }
}