import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { supplierUpdateSchema } from "@/lib/validators/supplier";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "suppliers", "read");
  if (auth.response) {
    return auth.response;
  }

  if (auth.session.role === "VENDEUR") {
    return fail("Acces refuse", 403);
  }

  const { id } = await params;
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      supplierInvoices: {
        include: { payments: true, returns: true },
        orderBy: { issueDate: "desc" }
      },
      purchaseOrders: {
        orderBy: { orderDate: "desc" },
        include: { items: true }
      }
    }
  });

  if (!supplier) {
    return fail("Fournisseur introuvable", 404);
  }

  return ok(supplier);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "suppliers", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, supplierUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) {
    return fail("Fournisseur introuvable", 404);
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const supplier = await tx.supplier.update({
      where: { id },
      data: {
        name: body.data.name,
        phone: body.data.phone,
        email: body.data.email,
        address: body.data.address,
        paymentTermsDays: body.data.paymentTermsDays,
        openingBalance: body.data.openingBalance,
        isActive: body.data.isActive
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_UPDATE",
        entity: "Supplier",
        entityId: id
      },
      tx
    );

    return supplier;
  });

  return ok(updated);
}
