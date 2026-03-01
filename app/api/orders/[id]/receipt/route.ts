import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";
import { evaluateOrderFinancialConsistency } from "@/lib/services/order-consistency";

import { Prisma } from "@prisma/client";

const bodySchema = z.object({
  paymentId: z.string().min(1)
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Payload invalide", 400);
  }

  const payment = await db.customerPayment.findUnique({
    where: { id: parsed.data.paymentId },
    include: {
      order: {
        include: {
          items: true
        }
      }
    }
  });
  if (!payment || payment.orderId !== id) {
    return fail("Paiement introuvable pour cette commande", 404);
  }

  if (payment.order.status === "ANNULEE") {
    return fail("Recu impossible pour commande annulee", 409);
  }

  if (payment.amount <= 0) {
    return fail("Montant paiement invalide", 409);
  }

  const consistency = evaluateOrderFinancialConsistency(payment.order);
  if (!consistency.isConsistent) {
    return fail("Incoherence montants commande: generation recu bloquee", 409, consistency);
  }

  const existing = await db.receipt.findFirst({ where: { paymentId: payment.id } });
  if (existing) {
    return ok(existing, { reused: true, printUrl: `/print/receipt/${existing.id}` });
  }

  const receipt = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const number = await nextSequence("RECEIPT", tx);
    const created = await tx.receipt.create({
      data: {
        number,
        orderId: id,
        paymentId: payment.id,
        issuedAt: new Date(),
        amount: payment.amount
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "RECEIPT_CREATE",
        entity: "Receipt",
        entityId: created.id,
        meta: { paymentId: payment.id, orderId: id }
      },
      tx
    );

    return created;
  });

  return ok(receipt, { printUrl: `/print/receipt/${receipt.id}` }, 201);
}
