import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import { summarizeSupplierDebt } from "@/lib/services/supplier-debt";

export default async function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Detail fournisseur">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const { id } = await params;
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      supplierInvoices: {
        orderBy: { issueDate: "desc" },
        include: {
          items: { select: { qty: true, unitCost: true } }
        }
      },
      purchaseOrders: {
        orderBy: { orderDate: "desc" },
        take: 20,
        include: {
          items: { select: { productId: true, qty: true, unitCost: true } }
        }
      }
    }
  });

  if (!supplier) {
    notFound();
  }

  const [payments, returns] = await Promise.all([
    db.supplierPayment.findMany({
      where: { supplierInvoice: { supplierId: supplier.id } },
      include: {
        supplierInvoice: { select: { id: true, number: true } },
        createdBy: { select: { displayName: true } }
      },
      orderBy: { paidAt: "desc" },
      take: 30
    }),
    db.supplierReturn.findMany({
      where: { supplierId: supplier.id },
      include: { supplierInvoice: { select: { id: true, number: true } } },
      orderBy: { date: "desc" },
      take: 30
    })
  ]);

  const poIds = supplier.purchaseOrders.map((po) => po.id);
  const receipts = poIds.length
    ? await db.stockMovement.findMany({
        where: {
          type: "IN",
          referenceType: "PURCHASE_ORDER",
          referenceId: { in: poIds }
        },
        select: { referenceId: true, productId: true, qty: true }
      })
    : [];

  const receivedByPOProduct = receipts.reduce<Record<string, number>>((acc, movement) => {
    const key = `${movement.referenceId}:${movement.productId}`;
    acc[key] = (acc[key] ?? 0) + movement.qty;
    return acc;
  }, {});

  const poRows = supplier.purchaseOrders.map((po) => {
    const orderedQty = Number(po.items.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
    const orderedAmount = Number(po.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0).toFixed(2));
    const receivedQty = Number(
      po.items
        .reduce((sum, item) => {
          const key = `${po.id}:${item.productId}`;
          return sum + (receivedByPOProduct[key] ?? 0);
        }, 0)
        .toFixed(2)
    );

    return {
      id: po.id,
      number: po.number,
      status: po.status,
      orderDate: po.orderDate,
      orderedQty,
      receivedQty,
      remainingQty: Number(Math.max(0, orderedQty - receivedQty).toFixed(2)),
      orderedAmount
    };
  });

  const debt = summarizeSupplierDebt(supplier.openingBalance, supplier.supplierInvoices);
  const today = new Date();
  const openInvoices = supplier.supplierInvoices.filter(
    (invoice) => invoice.balance > 0 && (invoice.status === "UNPAID" || invoice.status === "PARTIAL")
  ).length;
  const overdueInvoices = supplier.supplierInvoices.filter(
    (invoice) => invoice.balance > 0 && invoice.status !== "CANCELLED" && invoice.dueDate < today
  ).length;
  const activePOs = poRows.filter((po) => po.status === "CONFIRMED" || po.status === "RECEIVED").length;
  const paidLast30 = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const returnsAmount = returns.filter((ret) => ret.status !== "CANCELLED").reduce((sum, ret) => sum + ret.amount, 0);

  return (
    <AppShell session={session} title={`Fournisseur ${supplier.code}`}>
      <section className="detail-header">
        <div className="detail-header-main">
          <h2>{supplier.name}</h2>
          <p>
            Code: {supplier.code}{" "}
            <span className={`badge finance-status-badge ${supplier.isActive ? "ok" : "neutral"}`}>
              {supplier.isActive ? "Actif" : "Inactif"}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <Link href="/suppliers" className="btn">
            Retour fournisseurs
          </Link>
          <Link href="/suppliers/invoices" className="btn">
            Factures
          </Link>
          <Link href="/suppliers/purchase-orders" className="btn">
            Bons commande
          </Link>
        </div>
      </section>

      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Solde actuel</div>
          <strong className="metric-value">{formatDZD(debt.outstanding)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Factures ouvertes / en retard</div>
          <strong className="metric-value">
            {openInvoices} / {overdueInvoices}
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Paiements / Retours</div>
          <strong className="metric-value">
            {formatDZD(paidLast30)} / {formatDZD(returnsAmount)}
          </strong>
        </article>
      </section>

      <section className="detail-meta-grid">
        <div>
          <span>Telephone</span>
          <strong>{supplier.phone ?? "-"}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{supplier.email ?? "-"}</strong>
        </div>
        <div>
          <span>Delai paiement</span>
          <strong>{supplier.paymentTermsDays} jours</strong>
        </div>
        <div>
          <span>Solde ouverture</span>
          <strong>{formatDZD(debt.openingBalance)}</strong>
        </div>
        <div>
          <span>Bons de commande actifs</span>
          <strong>{activePOs}</strong>
        </div>
        <div>
          <span>Adresse</span>
          <strong>{supplier.address ?? "-"}</strong>
        </div>
      </section>

      <section className="detail-section-card">
        <h3 className="section-title">Resume dette</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Total facture</th>
              <th>Montant paye</th>
              <th>Solde actuel</th>
              <th>Solde echu</th>
              <th>0-30 j</th>
              <th>31-60 j</th>
              <th>61+ j</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatDZD(debt.invoicedAmount)}</td>
              <td>{formatDZD(debt.paidAmount)}</td>
              <td>{formatDZD(debt.outstanding)}</td>
              <td>{formatDZD(debt.overdueOutstanding)}</td>
              <td>{formatDZD(debt.aging["0-30"])}</td>
              <td>{formatDZD(debt.aging["31-60"])}</td>
              <td>{formatDZD(debt.aging["61+"])}</td>
            </tr>
          </tbody>
        </table>
        <p className="panel-note">
          Solde total: {formatDZD(debt.outstanding)} - dont echu: {formatDZD(debt.overdueOutstanding)}.
        </p>
      </section>

      <section className="detail-layout-2">
        <article className="card detail-section-card">
          <h3 className="section-title">Factures fournisseurs</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Date</th>
                <th>Echeance</th>
                <th>Statut</th>
                <th>Total</th>
                <th>Paye</th>
                <th>Solde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {supplier.supplierInvoices.length ? (
                supplier.supplierInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.issueDate.toISOString().slice(0, 10)}</td>
                    <td className={invoice.balance > 0 && invoice.status !== "CANCELLED" && invoice.dueDate < today ? "cell-overdue" : ""}>
                      {invoice.dueDate.toISOString().slice(0, 10)}
                    </td>
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
                  <td colSpan={8} className="table-empty-cell">
                    Aucune facture fournisseur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="card detail-section-card">
          <h3 className="section-title">Bons de commande</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Qte commandee</th>
                <th>Qte recue</th>
                <th>Restant</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {poRows.length ? (
                poRows.map((po) => (
                  <tr key={po.id}>
                    <td>{po.number}</td>
                    <td>{po.orderDate.toISOString().slice(0, 10)}</td>
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
                    <td>{po.orderedQty}</td>
                    <td>{po.receivedQty}</td>
                    <td>{po.remainingQty}</td>
                    <td>{formatDZD(po.orderedAmount)}</td>
                    <td>
                      <Link href={`/suppliers/purchase-orders/${po.id}`} className="table-link">
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="table-empty-cell">
                    Aucun bon de commande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      </section>

      <section className="detail-layout-2">
        <article className="card detail-section-card">
          <h3 className="section-title">Historique paiements</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Facture</th>
                <th>Mode</th>
                <th>Montant</th>
                <th>Operateur</th>
              </tr>
            </thead>
            <tbody>
              {payments.length ? (
                payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paidAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <Link href={`/suppliers/invoices/${payment.supplierInvoice.id}`} className="table-link">
                        {payment.supplierInvoice.number}
                      </Link>
                    </td>
                    <td>{payment.method}</td>
                    <td>{formatDZD(payment.amount)}</td>
                    <td>{payment.createdBy.displayName}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    Aucun paiement enregistre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="card detail-section-card">
          <h3 className="section-title">Retours fournisseur</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Date</th>
                <th>Facture</th>
                <th>Montant</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {returns.length ? (
                returns.map((ret) => (
                  <tr key={ret.id}>
                    <td>{ret.number}</td>
                    <td>{ret.date.toISOString().slice(0, 10)}</td>
                    <td>
                      {ret.supplierInvoice ? (
                        <Link href={`/suppliers/invoices/${ret.supplierInvoice.id}`} className="table-link">
                          {ret.supplierInvoice.number}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{formatDZD(ret.amount)}</td>
                    <td>
                      <span className={`badge finance-status-badge ${ret.status === "CANCELLED" ? "neutral" : "warn"}`}>
                        {ret.status}
                      </span>
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
