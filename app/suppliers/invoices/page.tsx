import Link from "next/link";
import { Prisma, SupplierInvoiceStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { SupplierInvoiceCreateModal } from "@/components/supplier-invoice-create-modal";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 25;
const statusOptions: Array<SupplierInvoiceStatus> = ["UNPAID", "PARTIAL", "PAID", "CANCELLED"];

function readParam(input: string | string[] | undefined) {
  if (!input) {
    return "";
  }
  return Array.isArray(input) ? input[0] ?? "" : input;
}

function parsePage(input: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function mergeWhere(
  base: Prisma.SupplierInvoiceWhereInput | undefined,
  extra: Prisma.SupplierInvoiceWhereInput
): Prisma.SupplierInvoiceWhereInput {
  if (!base) {
    return extra;
  }
  return { AND: [base, extra] };
}

export default async function SupplierInvoicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Factures fournisseurs">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const rawStatus = readParam(params.status);
  const selectedStatus = statusOptions.includes(rawStatus as SupplierInvoiceStatus)
    ? (rawStatus as SupplierInvoiceStatus)
    : "ALL";
  const overdueOnly = readParam(params.overdue) === "1";
  const today = new Date();

  const clauses: Prisma.SupplierInvoiceWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [{ number: { contains: q } }, { supplier: { name: { contains: q } } }]
    });
  }
  if (selectedStatus !== "ALL") {
    clauses.push({ status: selectedStatus });
  }
  if (overdueOnly) {
    clauses.push({
      balance: { gt: 0 },
      status: { not: "CANCELLED" },
      dueDate: { lt: today }
    });
  }
  const where: Prisma.SupplierInvoiceWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const totalCount = await db.supplierInvoice.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const [invoices, suppliers, products, debtAggregate, openCount, overdueCount] = await Promise.all([
    db.supplierInvoice.findMany({
      where,
      include: { supplier: true },
      orderBy: { issueDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.supplier.findMany({ select: { id: true, code: true, name: true, paymentTermsDays: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } }),
    db.supplierInvoice.aggregate({ where, _sum: { balance: true } }),
    db.supplierInvoice.count({
      where: mergeWhere(where, { status: { in: ["UNPAID", "PARTIAL"] } })
    }),
    db.supplierInvoice.count({
      where: mergeWhere(where, {
        balance: { gt: 0 },
        status: { not: "CANCELLED" },
        dueDate: { lt: today }
      })
    })
  ]);

  const [purchaseOrders, linkedInvoices] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { status: { in: ["CONFIRMED", "RECEIVED"] } },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { orderDate: "desc" }
    }),
    db.supplierInvoice.findMany({
      where: {
        purchaseOrderId: { not: null },
        status: { not: "CANCELLED" }
      },
      select: {
        purchaseOrderId: true,
        items: {
          select: {
            productId: true,
            qty: true
          }
        }
      }
    })
  ]);

  const invoicedByKey = linkedInvoices.reduce<Record<string, number>>((acc, invoice) => {
    if (!invoice.purchaseOrderId) {
      return acc;
    }
    for (const item of invoice.items) {
      const key = `${invoice.purchaseOrderId}:${item.productId}`;
      acc[key] = (acc[key] ?? 0) + item.qty;
    }
    return acc;
  }, {});

  const poOptions = purchaseOrders
    .map((po) => ({
      id: po.id,
      number: po.number,
      supplierId: po.supplierId,
      items: po.items
        .map((item) => {
          const key = `${po.id}:${item.productId}`;
          const alreadyInvoiced = Number((invoicedByKey[key] ?? 0).toFixed(2));
          const remainingQty = Number(Math.max(0, item.qty - alreadyInvoiced).toFixed(2));
          return {
            productId: item.productId,
            productName: item.product.name,
            remainingQty,
            unitCost: item.unitCost
          };
        })
        .filter((item) => item.remainingQty > 0)
    }))
    .filter((po) => po.items.length > 0);

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedStatus !== "ALL") {
      next.set("status", selectedStatus);
    }
    if (overdueOnly) {
      next.set("overdue", "1");
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/suppliers/invoices?${query}` : "/suppliers/invoices";
  }

  return (
    <AppShell session={session} title="Factures fournisseurs">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Factures ouvertes</div>
          <strong className="metric-value">{openCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Solde filtre</div>
          <strong className="metric-value">{formatDZD(debtAggregate._sum.balance ?? 0)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Factures en retard</div>
          <strong className="metric-value">{overdueCount}</strong>
        </article>
      </section>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Numero ou fournisseur" />
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={selectedStatus}>
            <option value="ALL">Tous</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Echeance
          <select className="input" name="overdue" defaultValue={overdueOnly ? "1" : ""}>
            <option value="">Toutes</option>
            <option value="1">En retard</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/suppliers/invoices" className="btn">
          Reinitialiser
        </Link>
      </form>

      <div className="table-toolbar">
        <div className="table-meta">
          Total: {totalCount} - Page {currentPage}/{totalPages}
        </div>
        <div className="pagination-controls">
          {currentPage > 1 ? (
            <Link href={buildHref(currentPage - 1)} className="btn">
              Precedent
            </Link>
          ) : (
            <span className="btn btn-disabled">Precedent</span>
          )}
          {currentPage < totalPages ? (
            <Link href={buildHref(currentPage + 1)} className="btn">
              Suivant
            </Link>
          ) : (
            <span className="btn btn-disabled">Suivant</span>
          )}
        </div>
      </div>

      <div className="page-actions">
        <SupplierInvoiceCreateModal suppliers={suppliers} products={products} purchaseOrders={poOptions} />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Numero</th>
            <th>Fournisseur</th>
            <th>Statut</th>
            <th>Total</th>
            <th>Solde</th>
            <th>Echeance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoices.length ? (
            invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td>
                <td>{inv.supplier.name}</td>
                <td>
                  <span
                    className={`badge finance-status-badge ${
                      inv.status === "PAID"
                        ? "ok"
                        : inv.status === "PARTIAL"
                          ? "warn"
                          : inv.status === "CANCELLED"
                            ? "neutral"
                            : "danger"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td>{formatDZD(inv.totalAmount)}</td>
                <td>{formatDZD(inv.balance)}</td>
                <td className={inv.balance > 0 && inv.status !== "CANCELLED" && inv.dueDate < today ? "cell-overdue" : ""}>
                  {inv.dueDate.toISOString().slice(0, 10)}
                </td>
                <td>
                  <Link href={`/suppliers/invoices/${inv.id}`} className="table-link">
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="table-empty-cell">
                Aucune facture fournisseur sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
