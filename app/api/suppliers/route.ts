import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { supplierCreateSchema } from "@/lib/validators/supplier";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";

import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "suppliers", "read");
  if (auth.response) {
    return auth.response;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const suppliers = await db.supplier.findMany({
    where: q
      ? {
          OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }]
        }
      : undefined,
    include: {
      supplierInvoices: {
        select: { totalAmount: true, paidAmount: true, balance: true, status: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const mapped = suppliers.map((supplier) => {
    const totals = supplier.supplierInvoices.reduce(
      (acc, inv) => {
        acc.total += inv.totalAmount;
        acc.paid += inv.paidAmount;
        acc.balance += inv.balance;
        return acc;
      },
      { total: supplier.openingBalance, paid: 0, balance: supplier.openingBalance }
    );

    const { supplierInvoices, openingBalance, ...base } = supplier;
    if (auth.session.role === "VENDEUR") {
      return base;
    }

    return {
      ...base,
      totalDebt: Number(totals.total.toFixed(2)),
      paidAmount: Number(totals.paid.toFixed(2)),
      outstanding: Number(totals.balance.toFixed(2))
    };
  });

  return ok(mapped);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "suppliers", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, supplierCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const code = await nextSequence("SUPPLIER", tx);
    const supplier = await tx.supplier.create({
      data: {
        code,
        name: body.data.name,
        phone: body.data.phone || null,
        email: body.data.email || null,
        address: body.data.address || null,
        paymentTermsDays: body.data.paymentTermsDays,
        openingBalance: body.data.openingBalance,
        isActive: body.data.isActive
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SUPPLIER_CREATE",
        entity: "Supplier",
        entityId: supplier.id
      },
      tx
    );

    return supplier;
  });

  return ok(created, undefined, 201);
}
