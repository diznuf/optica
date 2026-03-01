import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";
import { evaluateOrderFinancialConsistency } from "@/lib/services/order-consistency";

import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { invoices: true, items: true }
  });

  if (!order) {
    return fail("Commande introuvable", 404);
  }

  if (order.status === "BROUILLON") {
    return fail("Facture impossible pour brouillon", 409);
  }

  if (order.status === "ANNULEE") {
    return fail("Facture impossible pour commande annulee", 409);
  }

  const consistency = evaluateOrderFinancialConsistency(order);
  if (!consistency.isConsistent) {
    return fail("Incoherence montants commande: generation facture bloquee", 409, consistency);
  }

  if (order.invoices.length > 0) {
    return ok(order.invoices[0], {
      reused: true,
      printUrl: `/print/invoice/${order.invoices[0].id}`
    });
  }

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const number = await nextSequence("INVOICE", tx);
    const invoice = await tx.invoice.create({
      data: {
        number,
        orderId: id,
        issuedAt: new Date(),
        totalAmount: consistency.computedLinesTotal
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "INVOICE_CREATE",
        entity: "Invoice",
        entityId: invoice.id,
        meta: { orderId: id }
      },
      tx
    );

    return invoice;
  });

  return ok(created, { printUrl: `/print/invoice/${created.id}` }, 201);
}
