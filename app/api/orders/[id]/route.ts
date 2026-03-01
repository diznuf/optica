import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "read");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      patient: true,
      items: true,
      payments: true,
      deliveryNotes: true,
      invoices: true,
      receipts: true
    }
  });

  if (!order) {
    return fail("Commande introuvable", 404);
  }

  return ok(order);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "orders", "delete");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const order = await db.order.findUnique({ where: { id } });
  if (!order) {
    return fail("Commande introuvable", 404);
  }

  if (order.status !== "BROUILLON") {
    return fail("Suppression autorisee seulement pour brouillon", 409);
  }

  await db.$transaction(async (tx) => {
    await tx.order.delete({ where: { id } });
    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "ORDER_DELETE",
        entity: "Order",
        entityId: id
      },
      tx
    );
  });

  return ok({ deleted: true });
}