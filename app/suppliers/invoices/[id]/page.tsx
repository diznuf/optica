import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SupplierInvoiceActions } from "@/components/supplier-invoice-actions";
import { SupplierPaymentCancelButton } from "@/components/supplier-payment-cancel-button";
import { SupplierReturnCancelButton } from "@/components/supplier-return-cancel-button";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

export default async function SupplierInvoiceDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const canCancelPayments = session.role === "ADMIN";
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Facture fournisseur">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const { id } = await params;
  const invoice = await db.supplierInvoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true } },
      items: { include: { product: true } },
      payments: { orderBy: { paidAt: "desc" } },
      returns: { orderBy: { date: "desc" } }
    }
  });

  if (!invoice) {
    notFound();
  }

  const returnMovementRows = invoice.returns.length
    ? await db.stockMovement.findMany({
        where: {
          type: "RETURN_SUPPLIER",
          referenceType: "SUPPLIER_RETURN",
          referenceId: { in: invoice.returns.map((ret) => ret.id) }
        },
        select: { productId: true, qty: true }
      })
    : [];

  const returnedByProduct = returnMovementRows.reduce<Record<string, number>>((acc, movement) => {
    acc[movement.productId] = (acc[movement.productId] ?? 0) + movement.qty;
    return acc;
  }, {});

  const actionItemMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      invoicedQty: number;
      returnedQty: number;
      remainingQtyHint: number;
      unitCost: number;
      _costTotal: number;
    }
  >();

  for (const item of invoice.items) {
    const row = actionItemMap.get(item.productId) ?? {
      productId: item.productId,
      productName: item.product.name,
      invoicedQty: 0,
      returnedQty: 0,
      remainingQtyHint: 0,
      unitCost: 0,
      _costTotal: 0
    };
    row.invoicedQty += item.qty;
    row._costTotal += item.qty * item.unitCost;
    actionItemMap.set(item.productId, row);
  }

  const actionItems = Array.from(actionItemMap.values()).map((item) => {
    const returnedQty = Number((returnedByProduct[item.productId] ?? 0).toFixed(2));
    const invoicedQty = Number(item.invoicedQty.toFixed(2));
    const remainingQtyHint = Number(Math.max(0, invoicedQty - returnedQty).toFixed(2));
    const unitCost = Number((item._costTotal / Math.max(1, item.invoicedQty)).toFixed(2));
    return {
      productId: item.productId,
      productName: item.productName,
      invoicedQty,
      returnedQty,
      remainingQtyHint,
      unitCost
    };
  });
  const today = new Date();
  const paymentsTotal = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const returnsTotal = invoice.returns.reduce((sum, ret) => sum + ret.amount, 0);
  const activeReturnsTotal = invoice.returns.filter((ret) => ret.status !== "CANCELLED").reduce((sum, ret) => sum + ret.amount, 0);
  const totalQty = Number(invoice.items.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
  const expectedBalance = Number((invoice.totalAmount - paymentsTotal - activeReturnsTotal).toFixed(2));
  const balanceConsistent = Math.abs(expectedBalance - invoice.balance) <= 0.01;
  const dueState =
    invoice.status === "CANCELLED"
      ? "neutral"
      : invoice.balance <= 0
        ? "ok"
        : invoice.dueDate < today
          ? "danger"
          : "warn";

  return (
    <AppShell session={session} title={`Facture ${invoice.number}`}>
      <section className="detail-header">
        <div className="detail-header-main">
          <h2>{invoice.supplier.name}</h2>
          <p>
            Facture #{invoice.number}{" "}
            <span className={`badge finance-status-badge ${dueState}`}>{invoice.status}</span>
          </p>
        </div>
        <div className="page-actions">
          <Link href="/suppliers/invoices" className="btn">
            Retour factures
          </Link>
          <Link href={`/suppliers/${invoice.supplierId}`} className="btn">
            Ouvrir fournisseur
          </Link>
          {invoice.purchaseOrder ? (
            <Link href={`/suppliers/purchase-orders/${invoice.purchaseOrder.id}`} className="btn">
              BC {invoice.purchaseOrder.number}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Montant facture</div>
          <strong className="metric-value">{formatDZD(invoice.totalAmount)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Paye / Retours actifs</div>
          <strong className="metric-value">
            {formatDZD(paymentsTotal)} / {formatDZD(activeReturnsTotal)}
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Solde / Echeance</div>
          <strong className="metric-value">
            {formatDZD(invoice.balance)} / {invoice.dueDate.toISOString().slice(0, 10)}
          </strong>
        </article>
      </section>

      <section className="detail-meta-grid">
        <div>
          <span>Date emission</span>
          <strong>{invoice.issueDate.toISOString().slice(0, 10)}</strong>
        </div>
        <div>
          <span>Date echeance</span>
          <strong>{invoice.dueDate.toISOString().slice(0, 10)}</strong>
        </div>
        <div>
          <span>Total lignes / Quantite</span>
          <strong>
            {invoice.items.length} / {totalQty}
          </strong>
        </div>
        <div>
          <span>Bon de commande lie</span>
          <strong>{invoice.purchaseOrder ? invoice.purchaseOrder.number : "-"}</strong>
        </div>
        <div>
          <span>Retours totaux (incl. annules)</span>
          <strong>{formatDZD(returnsTotal)}</strong>
        </div>
      </section>

      <section className="detail-section-card">
        <h3 className="section-title">Actions facture</h3>
        <SupplierInvoiceActions
          invoiceId={invoice.id}
          invoiceStatus={invoice.status}
          invoiceBalance={invoice.balance}
          items={actionItems}
        />
      </section>
      {!balanceConsistent ? (
        <p className="info-text">
          Attention: solde attendu {formatDZD(expectedBalance)} mais solde facture {formatDZD(invoice.balance)}.
        </p>
      ) : null}

      <section className="detail-section-card">
        <h3 className="section-title">Lignes facture</h3>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Produit</th>
              <th>Qte</th>
              <th>Retourne</th>
              <th>Cout unitaire</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.length ? (
              invoice.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.product.name}</td>
                  <td>{item.qty}</td>
                  <td>{Number((returnedByProduct[item.productId] ?? 0).toFixed(2))}</td>
                  <td>{formatDZD(item.unitCost)}</td>
                  <td>{formatDZD(item.qty * item.unitCost)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="table-empty-cell">
                  Aucune ligne facture.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="detail-layout-2">
        <article className="card detail-section-card">
          <h3 className="section-title">Paiements</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th>Montant</th>
                <th>Reference</th>
                {canCancelPayments ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {invoice.payments.length ? (
                invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paidAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td>{payment.method}</td>
                    <td>{formatDZD(payment.amount)}</td>
                    <td>{payment.reference || "-"}</td>
                    {canCancelPayments ? (
                      <td>
                        <SupplierPaymentCancelButton invoiceId={invoice.id} paymentId={payment.id} />
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canCancelPayments ? 5 : 4} className="table-empty-cell">
                    Aucun paiement enregistre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="card detail-section-card">
          <h3 className="section-title">Retours</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Date</th>
                <th>Montant</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoice.returns.length ? (
                invoice.returns.map((ret) => (
                  <tr key={ret.id}>
                    <td>{ret.number}</td>
                    <td>{ret.date.toISOString().slice(0, 10)}</td>
                    <td>{formatDZD(ret.amount)}</td>
                    <td>
                      <span className={`badge finance-status-badge ${ret.status === "CANCELLED" ? "neutral" : "warn"}`}>
                        {ret.status}
                      </span>
                    </td>
                    <td>
                      <SupplierReturnCancelButton returnId={ret.id} status={ret.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    Aucun retour fournisseur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      </section>
    </AppShell>
  );
}
