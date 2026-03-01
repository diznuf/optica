import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { recomputeSupplierInvoice } from "@/lib/services/finance";
import { logAudit } from "@/lib/services/audit";
import { cancelDocumentSchema } from "@/lib/validators/supplier-invoice";

import { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  if (auth.session.role !== "ADMIN") {
    return fail("Acces reserve a l'administrateur", 403);
  }

  const body = await parseBody(request, cancelDocumentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const { id, paymentId } = await params;
  const payment = await db.supplierPayment.findUnique({
    where: { id: paymentId }
  });

  if (!payment || payment.supplierInvoiceId !== id) {
    return fail("Paiement introuvable pour cette facture", 404);
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.supplierPayment.delete({ where: { id: payment.id } });
    const invoice = await recomputeSupplierInvoice(id, tx);

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_PAYMENT_CANCEL",
        entity: "SupplierPayment",
        entityId: payment.id,
        meta: {
          supplierInvoiceId: id,
          amount: payment.amount,
          reason: body.data.reason
        }
      },
      tx
    );

    return {
      deletedPaymentId: payment.id,
      invoice
    };
  });

  return ok(result);
}
