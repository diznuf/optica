import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { customerPaymentSchema } from "@/lib/validators/order";
import { logAudit } from "@/lib/services/audit";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, customerPaymentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const amount = round2(body.data.amount);
  if (amount <= 0) {
    return fail("Montant paiement invalide", 400);
  }

  const order = await db.order.findUnique({ where: { id } });
  if (!order) {
    return fail("Commande introuvable", 404);
  }

  if (order.status === "ANNULEE") {
    return fail("Commande annulee", 409);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id,
          status: { not: "ANNULEE" },
          balance: { gte: amount }
        },
        data: {
          paidAmount: { increment: amount },
          balance: { decrement: amount }
        }
      });

      if (claimed.count === 0) {
        throw new Error("Montant superieur au solde restant");
      }

      const payment = await tx.customerPayment.create({
        data: {
          orderId: id,
          amount,
          method: body.data.method,
          paidAt: new Date(body.data.paidAt),
          reference: body.data.reference,
          createdById: auth.session.userId
        }
      });

      const refreshed = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          paidAmount: true,
          balance: true
        }
      });
      if (!refreshed) {
        throw new Error("Commande introuvable");
      }

      const paidAmount = round2(Math.max(0, refreshed.paidAmount));
      const balance = round2(Math.max(0, refreshed.balance));
      const nextStatus = refreshed.status === "BROUILLON" && paidAmount > 0 ? "CONFIRMEE" : refreshed.status;

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          paidAmount,
          balance,
          status: nextStatus
        }
      });

      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: "CUSTOMER_PAYMENT_CREATE",
          entity: "CustomerPayment",
          entityId: payment.id,
          meta: { orderId: id, amount: payment.amount }
        },
        tx
      );

      return { payment, order: updatedOrder };
    });

    return ok(result, undefined, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erreur paiement client", 409);
  }
}
