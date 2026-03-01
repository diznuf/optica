import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import { evaluateOrderFinancialConsistency } from "@/lib/services/order-consistency";

export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: {
      order: { include: { patient: true, items: true } },
      payment: true
    }
  });

  if (!receipt) {
    notFound();
  }

  const consistency = evaluateOrderFinancialConsistency(receipt.order);

  return (
    <main className="print-page">
      <PrintToolbar />
      <section className="print-sheet print-sheet-compact">
        <header className="print-header">
          <div>
            <p className="print-doc-type">Encaissement</p>
            <h1 className="print-title">Recu de paiement</h1>
            <div className="print-meta">Recu: {receipt.number}</div>
            <div className="print-meta">Date: {receipt.issuedAt.toISOString().slice(0, 10)}</div>
          </div>
          <div className="print-company-block">
            <strong>Optica Laboratoire</strong>
            <div className="print-meta">Encaissement client</div>
          </div>
        </header>

        <section className="print-entity-list">
          <div className="print-entity-card">
            <strong>Client:</strong> {receipt.order.patient.firstName} {receipt.order.patient.lastName}
          </div>
          <div className="print-entity-card">
            <strong>Commande:</strong> {receipt.order.number}
          </div>
          <div className="print-entity-card">
            <strong>Mode paiement:</strong> {receipt.payment.method}
          </div>
          <div className="print-entity-card">
            <strong>Date paiement:</strong> {receipt.payment.paidAt.toISOString().slice(0, 16).replace("T", " ")}
          </div>
          <div className="print-entity-card">
            <strong>Montant recu:</strong> {formatDZD(receipt.amount)}
          </div>
          <div className="print-entity-card">
            <strong>Total commande:</strong> {formatDZD(consistency.computedLinesTotal)} | <strong>Paye cumule:</strong>{" "}
            {formatDZD(receipt.order.paidAmount)} | <strong>Solde:</strong> {formatDZD(receipt.order.balance)}
          </div>
        </section>

        {!consistency.isConsistent ? (
          <div className="print-warning">Attention: incoherence montants detectee (verifier la commande).</div>
        ) : null}

        <footer className="print-signatures">
          <div className="print-signature">Signature Client</div>
          <div className="print-signature">Signature Caissier</div>
        </footer>
      </section>
    </main>
  );
}
