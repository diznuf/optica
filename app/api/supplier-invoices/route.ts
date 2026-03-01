import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { supplierInvoiceCreateSchema } from "@/lib/validators/supplier-invoice";
import { nextSequence } from "@/lib/services/sequence";
import { sumTotal } from "@/lib/services/math";
import { logAudit } from "@/lib/services/audit";

type InvoiceItemQty = {
  productId: string;
  qty: number;
};

type InvoicingDbClient = Prisma.TransactionClient | typeof db;

class InvoiceValidationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function aggregateQtyByProduct(items: InvoiceItemQty[]) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    byProduct.set(item.productId, round2((byProduct.get(item.productId) ?? 0) + item.qty));
  }
  return byProduct;
}

async function validatePurchaseOrderReconciliation(
  client: InvoicingDbClient,
  supplierId: string,
  purchaseOrderId: string,
  items: InvoiceItemQty[]
) {
  const po = await client.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { items: { select: { productId: true, qty: true } } }
  });

  if (!po) {
    throw new InvoiceValidationError("Bon de commande introuvable", 404);
  }

  if (po.supplierId !== supplierId) {
    throw new InvoiceValidationError("Le bon de commande ne correspond pas au fournisseur", 409);
  }

  const orderedByProduct = aggregateQtyByProduct(po.items);
  const incomingByProduct = aggregateQtyByProduct(items);

  const invoicedGroups = await client.supplierInvoiceItem.groupBy({
    by: ["productId"],
    where: {
      supplierInvoice: {
        purchaseOrderId,
        status: { not: "CANCELLED" }
      }
    },
    _sum: { qty: true }
  });

  const alreadyInvoicedByProduct = new Map(
    invoicedGroups.map((group) => [group.productId, round2(group._sum.qty ?? 0)])
  );

  for (const [productId, incomingQty] of incomingByProduct.entries()) {
    const orderedQty = orderedByProduct.get(productId);
    if (orderedQty === undefined) {
      throw new InvoiceValidationError("Une ligne facture contient un produit absent du bon de commande", 409);
    }

    const alreadyQty = alreadyInvoicedByProduct.get(productId) ?? 0;
    const totalAfterCreate = round2(alreadyQty + incomingQty);
    if (totalAfterCreate > orderedQty) {
      throw new InvoiceValidationError("Quantite facturee depasse le restant du bon de commande", 409);
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "supplier_finance", "read");
  if (auth.response) {
    return auth.response;
  }

  const supplierId = request.nextUrl.searchParams.get("supplierId");
  const invoices = await db.supplierInvoice.findMany({
    where: supplierId ? { supplierId } : undefined,
    include: {
      supplier: true,
      items: { include: { product: true } },
      payments: true,
      returns: true
    },
    orderBy: { issueDate: "desc" },
    take: 200
  });

  return ok(invoices);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "supplier_finance", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, supplierInvoiceCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const supplier = await db.supplier.findUnique({ where: { id: body.data.supplierId } });
  if (!supplier) {
    return fail("Fournisseur introuvable", 404);
  }

  if (body.data.purchaseOrderId) {
    try {
      await validatePurchaseOrderReconciliation(
        db,
        body.data.supplierId,
        body.data.purchaseOrderId,
        body.data.items
      );
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        return fail(error.message, error.status);
      }
      return fail("Erreur validation bon de commande", 409);
    }
  }

  const totalAmount = sumTotal(body.data.items);

  try {
    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      if (body.data.purchaseOrderId) {
        await validatePurchaseOrderReconciliation(
          tx,
          body.data.supplierId,
          body.data.purchaseOrderId,
          body.data.items
        );
      }

      const number = await nextSequence("SUPPLIER_INVOICE", tx);
      const invoice = await tx.supplierInvoice.create({
        data: {
          number,
          supplierId: body.data.supplierId,
          purchaseOrderId: body.data.purchaseOrderId || null,
          issueDate: new Date(body.data.issueDate),
          dueDate: new Date(body.data.dueDate),
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          status: "UNPAID",
          notes: body.data.notes,
          items: {
            create: body.data.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              unitCost: item.unitCost
            }))
          }
        },
        include: { items: true }
      });

      await logAudit(
        {
          actorUserId: auth.session.userId,
          action: "SUPPLIER_INVOICE_CREATE",
          entity: "SupplierInvoice",
          entityId: invoice.id,
          meta: { number: invoice.number, totalAmount }
        },
        tx
      );

      return invoice;
    });

    return ok(created, undefined, 201);
  } catch (error) {
    if (error instanceof InvoiceValidationError) {
      return fail(error.message, error.status);
    }
    return fail(error instanceof Error ? error.message : "Erreur creation facture fournisseur", 409);
  }
}
