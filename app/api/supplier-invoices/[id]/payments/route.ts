import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { supplierPaymentSchema } from "@/lib/validators/supplier-invoice";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, supplierPaymentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const amount = round2(body.data.amount);
  if (amount <= 0) {
    return fail("Montant paiement invalide", 400);
  }

  const invoice = await db.supplierInvoice.findUnique({ where: { id } });
  if (!invoice) {
    return fail("Facture fournisseur introuvable", 404);
  }

  if (invoice.status === "CANCELLED") {
    return fail("Facture annulee", 409);
  }

  try {
    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.supplierInvoice.updateMany({
        where: {
          id,
          status: { not: "CANCELLED" },
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

      const payment = await tx.supplierPayment.create({
        data: {
          supplierInvoiceId: id,
          amount,
          method: body.data.method,
          paidAt: new Date(body.data.paidAt),
          reference: body.data.reference,
          createdById: auth.session.userId
        }
      });

      const refreshed = await tx.supplierInvoice.findUnique({
        where: { id },
        select: {
          totalAmount: true,
          paidAmount: true,
          balance: true
        }
      });
      if (!refreshed) {
        throw new Error("Facture fournisseur introuvable");
      }

      const paidAmount = round2(Math.max(0, refreshed.paidAmount));
      const balance = round2(Math.max(0, refreshed.balance));
      const status = paidAmount === 0 ? "UNPAID" : balance <= 0 ? "PAID" : "PARTIAL";

      const updatedInvoice = await tx.supplierInvoice.update({
        where: { id },
        data: {
          paidAmount,
          balance,
          status
        }
      });

      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: "SUPPLIER_PAYMENT_CREATE",
          entity: "SupplierPayment",
          entityId: payment.id,
          meta: { invoiceId: id, amount }
        },
        tx
      );

      return { payment, invoice: updatedInvoice };
    });

    return ok(result, undefined, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erreur paiement fournisseur", 409);
  }
}
