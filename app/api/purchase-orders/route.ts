import { NextRequest } from "next/server";
import { PurchaseOrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { purchaseOrderCreateSchema } from "@/lib/validators/purchase-order";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "purchasing", "read");
  if (auth.response) {
    return auth.response;
  }

  const rawStatus = request.nextUrl.searchParams.get("status");
  const status = rawStatus && Object.values(PurchaseOrderStatus).includes(rawStatus as PurchaseOrderStatus)
    ? (rawStatus as PurchaseOrderStatus)
    : null;
  const poList = await db.purchaseOrder.findMany({
    where: status ? { status } : undefined,
    include: {
      supplier: true,
      items: { include: { product: true } }
    },
    orderBy: { orderDate: "desc" },
    take: 100
  });

  const poIds = poList.map((po) => po.id);
  const stockIns = poIds.length
    ? await db.stockMovement.findMany({
        where: {
          type: "IN",
          referenceType: "PURCHASE_ORDER",
          referenceId: { in: poIds }
        },
        select: {
          referenceId: true,
          productId: true,
          qty: true
        }
      })
    : [];

  const receivedByKey = stockIns.reduce<Record<string, number>>((acc, movement) => {
    const key = `${movement.referenceId}:${movement.productId}`;
    acc[key] = (acc[key] ?? 0) + movement.qty;
    return acc;
  }, {});

  const mapped = poList.map((po) => {
    const items = po.items.map((item) => {
      const key = `${po.id}:${item.productId}`;
      const receivedQty = Number((receivedByKey[key] ?? 0).toFixed(2));
      const remainingQty = Number(Math.max(0, item.qty - receivedQty).toFixed(2));
      return {
        ...item,
        receivedQty,
        remainingQty
      };
    });

    const orderedQty = Number(items.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
    const receivedQty = Number(items.reduce((sum, item) => sum + item.receivedQty, 0).toFixed(2));
    const remainingQty = Number(Math.max(0, orderedQty - receivedQty).toFixed(2));

    return {
      ...po,
      items,
      summary: {
        orderedQty,
        receivedQty,
        remainingQty
      }
    };
  });

  return ok(mapped);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "purchasing", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, purchaseOrderCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const supplier = await db.supplier.findUnique({ where: { id: body.data.supplierId } });
  if (!supplier) {
    return fail("Fournisseur introuvable", 404);
  }

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const number = await nextSequence("PURCHASE_ORDER", tx);
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: body.data.supplierId,
        orderDate: new Date(body.data.orderDate),
        expectedDate: body.data.expectedDate ? new Date(body.data.expectedDate) : null,
        notes: body.data.notes,
        status: "DRAFT",
        items: {
          create: body.data.items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitCost: item.unitCost
          }))
        }
      },
      include: { items: true }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PO_CREATE",
        entity: "PurchaseOrder",
        entityId: po.id,
        meta: { number: po.number }
      },
      tx
    );

    return po;
  });

  return ok(created, undefined, 201);
}
