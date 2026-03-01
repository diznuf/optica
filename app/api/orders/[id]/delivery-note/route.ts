import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";
import { evaluateOrderFinancialConsistency } from "@/lib/services/order-consistency";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { deliveryNotes: true, items: true }
  });

  if (!order) {
    return fail("Commande introuvable", 404);
  }

  if (!["PRETE", "LIVREE"].includes(order.status)) {
    return fail("Bon de livraison autorise seulement pour commande prete/livree", 409);
  }

  const consistency = evaluateOrderFinancialConsistency(order);
  if (!consistency.isConsistent) {
    return fail("Incoherence montants commande: generation BL bloquee", 409, consistency);
  }

  if (order.deliveryNotes.length > 0) {
    return ok(order.deliveryNotes[0], {
      reused: true,
      printUrl: `/print/delivery-note/${order.deliveryNotes[0].id}`
    });
  }

  const payload = await request.json().catch(() => ({}));

  const created = await db.$transaction(async (tx) => {
    const number = await nextSequence("DELIVERY_NOTE", tx);
    const note = await tx.deliveryNote.create({
      data: {
        number,
        orderId: id,
        deliveredAt: payload.deliveredAt ? new Date(payload.deliveredAt) : new Date(),
        deliveredBy: payload.deliveredBy ?? null,
        note: payload.note ?? null
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "DELIVERY_NOTE_CREATE",
        entity: "DeliveryNote",
        entityId: note.id,
        meta: { orderId: id }
      },
      tx
    );

    return note;
  });

  return ok(created, { printUrl: `/print/delivery-note/${created.id}` }, 201);
}
