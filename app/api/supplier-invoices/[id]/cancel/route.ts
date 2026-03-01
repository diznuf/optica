import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { cancelDocumentSchema } from "@/lib/validators/supplier-invoice";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, cancelDocumentSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const { id } = await params;
  const invoice = await db.supplierInvoice.findUnique({
    where: { id },
    include: {
      payments: { select: { id: true, amount: true } },
      returns: { where: { status: { not: "CANCELLED" } }, select: { id: true } }
    }
  });

  if (!invoice) {
    return fail("Facture fournisseur introuvable", 404);
  }

  if (invoice.status === "CANCELLED") {
    return fail("Facture deja annulee", 409);
  }

  if (invoice.payments.length > 0) {
    return fail("Impossible d'annuler une facture avec paiements enregistres", 409);
  }

  if (invoice.returns.length > 0) {
    return fail("Impossible d'annuler une facture avec retours confirmes", 409);
  }

  const cancelNote = `[CANCEL ${new Date().toISOString()}] ${body.data.reason}`;

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const record = await tx.supplierInvoice.update({
      where: { id },
      data: {
        status: "CANCELLED",
        balance: 0,
        notes: [invoice.notes, cancelNote].filter(Boolean).join("\n")
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_INVOICE_CANCEL",
        entity: "SupplierInvoice",
        entityId: id,
        meta: { from: invoice.status, to: "CANCELLED", reason: body.data.reason }
      },
      tx
    );

    return record;
  });

  return ok(updated);
}
