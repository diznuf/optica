import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import { evaluateOrderFinancialConsistency } from "@/lib/services/order-consistency";

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { order: { include: { patient: true, items: true } } }
  });

  if (!invoice) {
    notFound();
  }

  const consistency = evaluateOrderFinancialConsistency(invoice.order);

  return (
    <main className="print-page">
      <PrintToolbar />
      <section className="print-sheet">
        <header className="print-header">
          <div>
            <p className="print-doc-type">Facturation</p>
            <h1 className="print-title">Facture client</h1>
            <div className="print-meta">Facture: {invoice.number}</div>
            <div className="print-meta">Date: {invoice.issuedAt.toISOString().slice(0, 10)}</div>
          </div>
          <div className="print-company-block">
            <strong>I See</strong>
            <div className="print-meta">Rue Habiche Abdelaziz, El Eulma 19001</div>
          </div>
        </header>

        <section className="print-entity-grid">
          <div className="print-entity-card">
            <strong>Client:</strong> {invoice.order.patient.firstName} {invoice.order.patient.lastName}
          </div>
          <div className="print-entity-card">
            <strong>Commande:</strong> {invoice.order.number}
          </div>
        </section>

        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qte</th>
              <th>PU</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.order.items.map((item) => {
              const lineTotal = Number((item.qty * item.unitPrice).toFixed(2));
              return (
              <tr key={item.id}>
                <td>{item.descriptionSnapshot}</td>
                <td>{item.qty}</td>
                <td>{formatDZD(item.unitPrice)}</td>
                <td>{formatDZD(lineTotal)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>

        <div className="print-summary-block">
          <div>Total facture: {formatDZD(consistency.computedLinesTotal)}</div>
          <div>Paye: {formatDZD(invoice.order.paidAmount)}</div>
          <strong>Solde: {formatDZD(invoice.order.balance)}</strong>
        </div>
        {!consistency.isConsistent ? (
          <div className="print-warning">Attention: incoherence montants detectee (verifier la commande).</div>
        ) : null}

        <footer className="print-signatures">
          <div className="print-signature">Signature Client</div>
          <div className="print-signature">Cachet et Signature</div>
        </footer>
      </section>
    </main>
  );
}
