"use client";

import { FormEvent, useMemo, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Payment = {
  id: string;
  amount: number;
  method: string;
};

const statusTransitions: Record<string, string[]> = {
  BROUILLON: ["CONFIRMEE", "ANNULEE"],
  CONFIRMEE: ["EN_ATELIER", "ANNULEE"],
  EN_ATELIER: ["PRETE", "ANNULEE"],
  PRETE: ["LIVREE", "ANNULEE"],
  LIVREE: ["ANNULEE"],
  ANNULEE: []
};

const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  CONFIRMEE: "Confirmee",
  EN_ATELIER: "En atelier",
  PRETE: "Prete",
  LIVREE: "Livree",
  ANNULEE: "Annulee"
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function nowLocalDateTimeValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

export function OrderActions({
  orderId,
  currentStatus,
  balance,
  payments
}: {
  orderId: string;
  currentStatus: string;
  balance: number;
  payments: Payment[];
}) {
  const allowedStatuses = useMemo(
    () => [currentStatus, ...(statusTransitions[currentStatus] ?? [])],
    [currentStatus]
  );

  const [targetStatus, setTargetStatus] = useState(currentStatus);
  const [statusNote, setStatusNote] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(round2(Math.max(0, balance)));
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState(nowLocalDateTimeValue());
  const [paymentReference, setPaymentReference] = useState("");
  const [receiptPaymentId, setReceiptPaymentId] = useState(payments[0]?.id ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [documentAction, setDocumentAction] = useState<"delivery" | "invoice" | "receipt" | null>(null);
  const toast = useToast();

  const hasPayments = useMemo(() => payments.length > 0, [payments]);
  const canAddPayment = balance > 0 && currentStatus !== "ANNULEE";
  const canGenerateDocs = currentStatus !== "ANNULEE";
  const canGenerateReceipt = canGenerateDocs && hasPayments;
  const paymentBalanceAfter = round2(Math.max(0, balance - paymentAmount));

  function setPaymentFromRatio(ratio: number) {
    setPaymentAmount(round2(Math.max(0, balance * ratio)));
  }

  async function changeStatus(event: FormEvent) {
    event.preventDefault();

    if (targetStatus === currentStatus) {
      toast.info("Statut deja applique.");
      return;
    }

    if (targetStatus === "ANNULEE" && !statusNote.trim()) {
      toast.error("Raison d'annulation requise.");
      return;
    }

    setSavingStatus(true);
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus, note: statusNote || undefined })
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur statut");
      setSavingStatus(false);
      return;
    }
    setFlashToast({ type: "success", message: "Statut mis a jour" });
    window.location.reload();
  }

  async function addPayment(event: FormEvent) {
    event.preventDefault();

    if (!canAddPayment) {
      toast.error("Paiement indisponible pour cette commande.");
      return;
    }
    if (paymentAmount <= 0) {
      toast.error("Montant paiement invalide.");
      return;
    }
    if (paymentAmount > balance) {
      toast.error("Montant superieur au solde restant.");
      return;
    }

    setSavingPayment(true);
    const res = await fetch(`/api/orders/${orderId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: paymentAmount,
        method: paymentMethod,
        paidAt: localDateTimeToIso(paymentDate),
        reference: paymentReference || undefined
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur paiement client");
      setSavingPayment(false);
      return;
    }
    setFlashToast({ type: "success", message: "Paiement ajoute" });
    window.location.reload();
  }

  async function generateDocument(type: "delivery" | "invoice" | "receipt") {
    if (!canGenerateDocs) {
      toast.error("Documents indisponibles pour commande annulee.");
      return;
    }
    if (type === "receipt" && !receiptPaymentId) {
      toast.error("Selectionnez un paiement pour le recu.");
      return;
    }

    setDocumentAction(type);

    const request =
      type === "delivery"
        ? fetch(`/api/orders/${orderId}/delivery-note`, { method: "POST" })
        : type === "invoice"
          ? fetch(`/api/orders/${orderId}/invoice`, { method: "POST" })
          : fetch(`/api/orders/${orderId}/receipt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentId: receiptPaymentId })
            });

    const res = await request;
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur generation document");
      setDocumentAction(null);
      return;
    }

    if (payload.meta?.printUrl) {
      window.open(payload.meta.printUrl as string, "_blank");
    }
    toast.success(type === "delivery" ? "Bon de livraison genere" : type === "invoice" ? "Facture generee" : "Recu genere");
    setDocumentAction(null);
  }

  return (
    <div className="grid order-action-stack">
      <form className="card action-card action-form" onSubmit={changeStatus}>
        <h3 className="section-title">Changer statut commande</h3>
        <div className="panel-note">
          Statut actuel: {statusLabels[currentStatus] ?? currentStatus}
          {allowedStatuses.length <= 1 ? " | Aucun changement possible." : null}
        </div>
        <div className="grid grid-3">
          <label>
            Nouveau statut
            <select className="input" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status] ?? status}
                </option>
              ))}
            </select>
          </label>
          <label className="field-span-2">
            Note (obligatoire pour Annulee)
            <input
              className="input"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Raison / commentaire statut"
            />
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={savingStatus || targetStatus === currentStatus}>
          {savingStatus ? "Application..." : "Appliquer statut"}
        </button>
      </form>

      <form className="card action-card action-form" onSubmit={addPayment}>
        <h3 className="section-title">Ajouter paiement client</h3>
        <div className="panel-note">
          Solde restant: {balance.toFixed(2)} DZD | Solde apres paiement: {paymentBalanceAfter.toFixed(2)} DZD
        </div>
        <div className="inline-chip-actions">
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(1)} disabled={!canAddPayment}>
            Solde
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(0.5)} disabled={!canAddPayment}>
            50%
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(0.25)} disabled={!canAddPayment}>
            25%
          </button>
        </div>
        <div className="grid grid-3">
          <label>
            Montant
            <input
              className="input"
              type="number"
              min={0.01}
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value || 0))}
              required
              disabled={!canAddPayment}
            />
          </label>
          <label>
            Mode
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={!canAddPayment}>
              <option value="CASH">Cash</option>
              <option value="CARD">Carte</option>
              <option value="TRANSFER">Virement</option>
            </select>
          </label>
          <label>
            Date paiement
            <input
              className="input"
              type="datetime-local"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              disabled={!canAddPayment}
            />
          </label>
        </div>
        <label>
          Reference (optionnel)
          <input
            className="input"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="Numero recu, transaction..."
            disabled={!canAddPayment}
          />
        </label>
        {!canAddPayment ? <div className="panel-note">Commande soldee ou annulee: aucun paiement supplementaire.</div> : null}
        <button className="btn" type="submit" disabled={!canAddPayment || savingPayment}>
          {savingPayment ? "Enregistrement..." : "Enregistrer paiement"}
        </button>
      </form>

      <div className="card action-card action-form">
        <h3 className="section-title">Documents</h3>
        <div className="form-actions">
          <button
            className="btn"
            type="button"
            onClick={() => generateDocument("delivery")}
            disabled={!canGenerateDocs || documentAction !== null}
          >
            {documentAction === "delivery" ? "Generation..." : "Bon de livraison"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => generateDocument("invoice")}
            disabled={!canGenerateDocs || documentAction !== null}
          >
            {documentAction === "invoice" ? "Generation..." : "Facture"}
          </button>
        </div>
        <div className="grid grid-3">
          <label>
            Paiement pour recu
            <select
              className="input"
              value={receiptPaymentId}
              onChange={(e) => setReceiptPaymentId(e.target.value)}
              disabled={!canGenerateReceipt}
            >
              {payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.method} - {payment.amount.toFixed(2)} DZD
                </option>
              ))}
            </select>
          </label>
          <div className="field-end">
            <button
              className="btn"
              type="button"
              onClick={() => generateDocument("receipt")}
              disabled={!canGenerateReceipt || documentAction !== null}
            >
              {documentAction === "receipt" ? "Generation..." : "Generer recu"}
            </button>
          </div>
        </div>
        {!hasPayments ? <div className="panel-note">Aucun paiement disponible pour generer un recu.</div> : null}
      </div>
    </div>
  );
}
