import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { recomputeOrder } from "@/lib/services/finance";
import { logAudit } from "@/lib/services/audit";
import { cancelPaymentSchema } from "@/lib/validators/order";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  if (auth.session.role !== "ADMIN") {
    return fail("Acces reserve a l'administrateur", 403);
  }

  const body = await parseBody(request, cancelPaymentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const { id, paymentId } = await params;
  const payment = await db.customerPayment.findUnique({
    where: { id: paymentId },
    include: {
      receipt: { select: { id: true } }
    }
  });

  if (!payment || payment.orderId !== id) {
    return fail("Paiement introuvable pour cette commande", 404);
  }

  const result = await db.$transaction(async (tx) => {
    if (payment.receipt) {
      await tx.receipt.delete({ where: { id: payment.receipt.id } });
    }

    await tx.customerPayment.delete({ where: { id: payment.id } });
    const order = await recomputeOrder(id, tx);

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "CUSTOMER_PAYMENT_CANCEL",
        entity: "CustomerPayment",
        entityId: payment.id,
        meta: {
          orderId: id,
          amount: payment.amount,
          reason: body.data.reason,
          receiptId: payment.receipt?.id ?? null
        }
      },
      tx
    );

    return {
      deletedPaymentId: payment.id,
      deletedReceiptId: payment.receipt?.id ?? null,
      order
    };
  });

  return ok(result);
}
