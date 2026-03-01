import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { orderStatusSchema } from "@/lib/validators/order";
import { canTransitionOrder } from "@/lib/services/order-status";
import { recordStockMovement } from "@/lib/services/stock";
import { logAudit } from "@/lib/services/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, orderStatusSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) {
    return fail("Commande introuvable", 404);
  }

  const isAdmin = auth.session.role === "ADMIN";
  if (!canTransitionOrder(order.status, body.data.status, isAdmin)) {
    return fail("Transition de statut invalide", 409);
  }

  if (body.data.status === "ANNULEE" && !body.data.note?.trim()) {
    return fail("Raison d'annulation requise", 400);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      if (order.status !== "LIVREE" && body.data.status === "LIVREE") {
        for (const item of order.items) {
          if (!item.productId) {
            continue;
          }

          await recordStockMovement({
            tx,
            productId: item.productId,
            type: "OUT",
            qty: item.qty,
            referenceType: "ORDER",
            referenceId: order.id,
            note: `Livraison commande ${order.number}`,
            createdById: auth.session.userId
          });
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: body.data.status,
          notes:
            body.data.status === "ANNULEE"
              ? [order.notes, `[CANCEL ${new Date().toISOString()}] ${body.data.note?.trim()}`].filter(Boolean).join("\n")
              : order.notes
        }
      });

      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: "ORDER_STATUS_CHANGE",
          entity: "Order",
          entityId: id,
          meta: { from: order.status, to: body.data.status, note: body.data.note }
        },
        tx
      );

      return updated;
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erreur transition statut", 400);
  }
}
