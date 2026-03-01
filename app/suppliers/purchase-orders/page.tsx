import Link from "next/link";
import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PurchaseOrderActions } from "@/components/purchase-order-actions";
import { PurchaseOrderCreateModal } from "@/components/purchase-order-create-modal";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 25;
const statusOptions: Array<PurchaseOrderStatus> = ["DRAFT", "CONFIRMED", "RECEIVED", "CANCELLED"];

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

export default async function SupplierPOPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Bons de commande fournisseurs">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const rawStatus = readParam(params.status);
  const selectedStatus = statusOptions.includes(rawStatus as PurchaseOrderStatus)
    ? (rawStatus as PurchaseOrderStatus)
    : "ALL";

  const clauses: Prisma.PurchaseOrderWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [{ number: { contains: q } }, { supplier: { name: { contains: q } } }]
    });
  }
  if (selectedStatus !== "ALL") {
    clauses.push({ status: selectedStatus });
  }
  const where: Prisma.PurchaseOrderWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const totalCount = await db.purchaseOrder.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const [pos, suppliers, products, groupedStatus] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: { supplier: true, items: true },
      orderBy: { orderDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.supplier.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } }),
    db.purchaseOrder.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    })
  ]);

  const poIds = pos.map((po) => po.id);
  const stockIns = poIds.length
    ? await db.stockMovement.findMany({
        where: {
          type: "IN",
          referenceType: "PURCHASE_ORDER",
          referenceId: { in: poIds }
        },
        select: { referenceId: true, productId: true, qty: true }
      })
    : [];

  const receivedByKey = stockIns.reduce<Record<string, number>>((acc, movement) => {
    const key = `${movement.referenceId}:${movement.productId}`;
    acc[key] = (acc[key] ?? 0) + movement.qty;
    return acc;
  }, {});

  const poRows = pos.map((po) => {
    const remainingQty = Number(
      po.items
        .reduce((sum, item) => {
          const key = `${po.id}:${item.productId}`;
          const received = Number((receivedByKey[key] ?? 0).toFixed(2));
          return sum + Math.max(0, item.qty - received);
        }, 0)
        .toFixed(2)
    );

    return {
      po,
      remainingQty
    };
  });

  const byStatus = groupedStatus.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
  const remainingTotal = Number(poRows.reduce((sum, row) => sum + row.remainingQty, 0).toFixed(2));

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedStatus !== "ALL") {
      next.set("status", selectedStatus);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/suppliers/purchase-orders?${query}` : "/suppliers/purchase-orders";
  }

  return (
    <AppShell session={session} title="Bons de commande fournisseurs">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">BC actifs</div>
          <strong className="metric-value">{(byStatus.CONFIRMED ?? 0) + (byStatus.RECEIVED ?? 0)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">BC brouillons / annules</div>
          <strong className="metric-value">
            {byStatus.DRAFT ?? 0} / {byStatus.CANCELLED ?? 0}
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Quantite restante (page)</div>
          <strong className="metric-value">{remainingTotal}</strong>
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
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/suppliers/purchase-orders" className="btn">
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
        <PurchaseOrderCreateModal suppliers={suppliers} products={products} />
        <Link href="/suppliers/invoices" className="btn">
          Factures fournisseurs
        </Link>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Numero</th>
            <th>Fournisseur</th>
            <th>Statut</th>
            <th>Date</th>
            <th>Lignes</th>
            <th>Restant</th>
            <th>Actions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {poRows.length ? (
            poRows.map(({ po, remainingQty }) => (
              <tr key={po.id}>
                <td>{po.number}</td>
                <td>{po.supplier.name}</td>
                <td>
                  <span
                    className={`badge finance-status-badge ${
                      po.status === "RECEIVED"
                        ? "ok"
                        : po.status === "CONFIRMED"
                          ? "warn"
                          : po.status === "CANCELLED"
                            ? "neutral"
                            : "danger"
                    }`}
                  >
                    {po.status}
                  </span>
                </td>
                <td>{po.orderDate.toISOString().slice(0, 10)}</td>
                <td>{po.items.length}</td>
                <td>{remainingQty}</td>
                <td>
                  <PurchaseOrderActions poId={po.id} status={po.status} canDelete={session.role === "ADMIN"} />
                </td>
                <td>
                  <Link href={`/suppliers/purchase-orders/${po.id}`} className="table-link">
                    Detail
                  </Link>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="table-empty-cell">
                Aucun bon de commande sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
