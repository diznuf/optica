import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PurchaseOrderActions } from "@/components/purchase-order-actions";
import { PurchaseOrderReceiveForm } from "@/components/purchase-order-receive-form";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

export default async function PurchaseOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Detail bon de commande">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const { id } = await params;

  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        include: {
          product: true
        }
      }
    }
  });

  if (!po) {
    notFound();
  }

  const stockIns = await db.stockMovement.findMany({
    where: {
      type: "IN",
      referenceType: "PURCHASE_ORDER",
      referenceId: po.id
    },
    select: {
      productId: true,
      qty: true,
      createdAt: true,
      note: true,
      id: true
    },
    orderBy: { createdAt: "desc" }
  });

  const receivedByProduct = stockIns.reduce<Record<string, number>>((acc, mv) => {
    acc[mv.productId] = (acc[mv.productId] ?? 0) + mv.qty;
    return acc;
  }, {});

  const items = po.items.map((item) => {
    const receivedQty = Number((receivedByProduct[item.productId] ?? 0).toFixed(2));
    const remainingQty = Number(Math.max(0, item.qty - receivedQty).toFixed(2));
    return {
      ...item,
      receivedQty,
      remainingQty
    };
  });

  const orderedQty = Number(items.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
  const receivedQty = Number(items.reduce((sum, item) => sum + item.receivedQty, 0).toFixed(2));
  const remainingQty = Number(Math.max(0, orderedQty - receivedQty).toFixed(2));
  const totalAmount = Number(items.reduce((sum, item) => sum + item.qty * item.unitCost, 0).toFixed(2));
  const linkedInvoices = await db.supplierInvoice.findMany({
    where: { purchaseOrderId: po.id },
    orderBy: { issueDate: "desc" },
    select: {
      id: true,
      number: true,
      issueDate: true,
      totalAmount: true,
      paidAmount: true,
      balance: true,
      status: true
    }
  });
  const linkedInvoicesTotal = linkedInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const receivedPercent = orderedQty > 0 ? Math.min(100, Number(((receivedQty / orderedQty) * 100).toFixed(1))) : 0;
  const statusTone =
    po.status === "RECEIVED" ? "ok" : po.status === "CONFIRMED" ? "warn" : po.status === "CANCELLED" ? "neutral" : "danger";

  return (
    <AppShell session={session} title={`Bon de commande ${po.number}`}>
      <section className="detail-header">
        <div className="detail-header-main">
          <h2>{po.supplier.name}</h2>
          <p>
            Bon de commande #{po.number} <span className={`badge finance-status-badge ${statusTone}`}>{po.status}</span>
          </p>
        </div>
        <div className="page-actions">
          <Link href="/suppliers/purchase-orders" className="btn">
            Retour BC
          </Link>
          <Link href={`/suppliers/${po.supplierId}`} className="btn">
            Ouvrir fournisseur
          </Link>
          <Link href="/suppliers/invoices" className="btn">
            Factures
          </Link>
        </div>
      </section>

      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Qte commandee</div>
          <strong className="metric-value">{orderedQty}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Qte recue / Restant</div>
          <strong className="metric-value">
            {receivedQty} / {remainingQty}
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Montant commande</div>
          <strong className="metric-value">{formatDZD(totalAmount)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Avancement reception</div>
          <strong className="metric-value">{receivedPercent}%</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Factures liees</div>
          <strong className="metric-value">
            {linkedInvoices.length} / {formatDZD(linkedInvoicesTotal)}
          </strong>
        </article>
      </section>

      <section className="detail-meta-grid">
        <div>
          <span>Date BC</span>
          <strong>{po.orderDate.toISOString().slice(0, 10)}</strong>
        </div>
        <div>
          <span>Lignes</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Fournisseur</span>
          <strong>{po.supplier.code}</strong>
        </div>
        <div>
          <span>Date attendue</span>
          <strong>{po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : "-"}</strong>
        </div>
        <div>
          <span>Notes</span>
          <strong>{po.notes || "-"}</strong>
        </div>
      </section>

      <section className="detail-section-card">
        <h3 className="section-title">Actions bon de commande</h3>
        <PurchaseOrderActions poId={po.id} status={po.status} canDelete={session.role === "ADMIN"} />
      </section>

      <section className="detail-section-card">
        <h3 className="section-title">Reception partielle</h3>
        <PurchaseOrderReceiveForm
          poId={po.id}
          poStatus={po.status}
          items={items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            orderedQty: item.qty,
            receivedQty: item.receivedQty,
            remainingQty: item.remainingQty
          }))}
        />
      </section>

      <section className="detail-layout-2">
        <article className="card detail-section-card">
          <h3 className="section-title">Lignes bon de commande</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Qte commandee</th>
                <th>Qte recue</th>
                <th>Restant</th>
                <th>Cout unitaire</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product.name}</td>
                    <td>{item.qty}</td>
                    <td>{item.receivedQty}</td>
                    <td>{item.remainingQty}</td>
                    <td>{formatDZD(item.unitCost)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    Aucune ligne dans ce bon de commande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="card detail-section-card">
          <h3 className="section-title">Historique receptions</h3>
          {stockIns.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Qte</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {stockIns.map((mv) => {
                  const product = po.items.find((item) => item.productId === mv.productId)?.product;
                  return (
                    <tr key={mv.id}>
                      <td>{mv.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td>{product?.name ?? mv.productId}</td>
                      <td>{mv.qty}</td>
                      <td>{mv.note ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="detail-empty">Aucune reception enregistree.</p>
          )}
        </article>
      </section>

      <section className="card detail-section-card">
        <h3 className="section-title">Factures liees au bon</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Numero</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Total</th>
              <th>Paye</th>
              <th>Solde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linkedInvoices.length ? (
              linkedInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.number}</td>
                  <td>{invoice.issueDate.toISOString().slice(0, 10)}</td>
                  <td>
                    <span
                      className={`badge finance-status-badge ${
                        invoice.status === "PAID"
                          ? "ok"
                          : invoice.status === "PARTIAL"
                            ? "warn"
                            : invoice.status === "CANCELLED"
                              ? "neutral"
                              : "danger"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td>{formatDZD(invoice.totalAmount)}</td>
                  <td>{formatDZD(invoice.paidAmount)}</td>
                  <td>{formatDZD(invoice.balance)}</td>
                  <td>
                    <Link href={`/suppliers/invoices/${invoice.id}`} className="table-link">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="table-empty-cell">
                  Aucune facture liee a ce bon.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
