import { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function recomputeSupplierInvoice(invoiceId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const invoice = await client.supplierInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true }
  });

  if (!invoice) {
    throw new Error("Facture fournisseur introuvable");
  }

  const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Number((invoice.totalAmount - paidAmount).toFixed(2));
  const status = paidAmount === 0 ? "UNPAID" : balance <= 0 ? "PAID" : "PARTIAL";

  return client.supplierInvoice.update({
    where: { id: invoiceId },
    data: { paidAmount, balance, status }
  });
}

export async function recomputeOrder(orderId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const order = await client.order.findUnique({
    where: { id: orderId },
    include: { payments: true }
  });

  if (!order) {
    throw new Error("Commande introuvable");
  }

  const paidAmount = order.payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Number((order.totalAmount - paidAmount).toFixed(2));

  return client.order.update({
    where: { id: orderId },
    data: {
      paidAmount,
      balance,
      status: order.status === "BROUILLON" && paidAmount > 0 ? OrderStatus.CONFIRMEE : order.status
    }
  });
}