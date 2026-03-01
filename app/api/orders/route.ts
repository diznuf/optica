import { NextRequest } from "next/server";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { orderCreateSchema } from "@/lib/validators/order";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";
import { sumTotal } from "@/lib/services/math";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "orders", "read");
  if (auth.response) {
    return auth.response;
  }

  const rawStatus = request.nextUrl.searchParams.get("status");
  const status = rawStatus && Object.values(OrderStatus).includes(rawStatus as OrderStatus)
    ? (rawStatus as OrderStatus)
    : null;
  const orders = await db.order.findMany({
    where: status ? { status } : undefined,
    include: {
      patient: true,
      items: true,
      payments: true
    },
    orderBy: { orderDate: "desc" },
    take: 200
  });

  return ok(orders);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, orderCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const patient = await db.patient.findUnique({ where: { id: body.data.patientId } });
  if (!patient) {
    return fail("Patient introuvable", 404);
  }

  const totalAmount = sumTotal(body.data.items.map((item) => ({ qty: item.qty, unitPrice: item.unitPrice })));

  const created = await db.$transaction(async (tx) => {
    const number = await nextSequence("ORDER", tx);
    const order = await tx.order.create({
      data: {
        number,
        patientId: body.data.patientId,
        status: "BROUILLON",
        orderDate: new Date(body.data.orderDate),
        promisedDate: body.data.promisedDate ? new Date(body.data.promisedDate) : null,
        notes: body.data.notes,
        totalAmount,
        paidAmount: 0,
        balance: totalAmount,
        createdById: auth.session.userId,
        items: {
          create: body.data.items.map((item) => ({
            productId: item.productId || null,
            descriptionSnapshot: item.descriptionSnapshot,
            qty: item.qty,
            unitPrice: item.unitPrice,
            lineTotal: Number((item.qty * item.unitPrice).toFixed(2)),
            prescriptionSnapshotJson: item.prescriptionSnapshotJson
          }))
        }
      },
      include: { items: true }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "ORDER_CREATE",
        entity: "Order",
        entityId: order.id,
        meta: { number: order.number, totalAmount }
      },
      tx
    );

    return order;
  });

  return ok(created, undefined, 201);
}
