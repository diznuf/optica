"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type InvoiceItem = {
  productId: string;
  productName: string;
  invoicedQty: number;
  returnedQty: number;
  remainingQtyHint: number;
  unitCost: number;
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

export function SupplierInvoiceActions({
  invoiceId,
  invoiceStatus,
  invoiceBalance,
  items
}: {
  invoiceId: string;
  invoiceStatus: string;
  invoiceBalance: number;
  items: InvoiceItem[];
}) {
  const returnableItems = useMemo(() => items.filter((item) => item.remainingQtyHint > 0), [items]);
  const canEditInvoice = invoiceStatus !== "CANCELLED";
  const canPay = canEditInvoice && invoiceBalance > 0;
  const canReturn = canEditInvoice && returnableItems.length > 0;

  const [amount, setAmount] = useState(round2(Math.max(0, invoiceBalance)));
  const [method, setMethod] = useState("CASH");
  const [paidAt, setPaidAt] = useState(nowLocalDateTimeValue());
  const [paymentReference, setPaymentReference] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [returnProductId, setReturnProductId] = useState(returnableItems[0]?.productId ?? "");
  const [returnQty, setReturnQty] = useState(1);
  const [returnAmount, setReturnAmount] = useState(0);
  const [returnDate, setReturnDate] = useState(nowLocalDateTimeValue());
  const [returnNote, setReturnNote] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const toast = useToast();

  const selectedItem = useMemo(
    () => returnableItems.find((item) => item.productId === returnProductId) ?? null,
    [returnableItems, returnProductId]
  );
  const paymentBalanceAfter = round2(Math.max(0, invoiceBalance - amount));
  const returnMaxAmount = selectedItem ? round2(selectedItem.remainingQtyHint * selectedItem.unitCost) : 0;

  useEffect(() => {
    if (!returnableItems.length) {
      setReturnProductId("");
      return;
    }
    if (!returnableItems.some((item) => item.productId === returnProductId)) {
      setReturnProductId(returnableItems[0].productId);
    }
  }, [returnProductId, returnableItems]);

  useEffect(() => {
    if (!selectedItem) {
      setReturnQty(1);
      setReturnAmount(0);
      return;
    }

    const nextQty = Math.min(Math.max(0.01, returnQty), selectedItem.remainingQtyHint);
    setReturnQty(round2(nextQty));
    setReturnAmount(round2(nextQty * selectedItem.unitCost));
  }, [selectedItem, returnQty]);

  function setPaymentFromRatio(ratio: number) {
    setAmount(round2(Math.max(0, invoiceBalance * ratio)));
  }

  function setReturnQtyFromRatio(ratio: number) {
    if (!selectedItem) {
      return;
    }
    const nextQty = round2(Math.max(0.01, selectedItem.remainingQtyHint * ratio));
    setReturnQty(nextQty);
    setReturnAmount(round2(nextQty * selectedItem.unitCost));
  }

  const paymentDisabled = !canPay || submittingPayment;
  const returnDisabled = !canReturn || submittingReturn;

  async function submitPayment(event: FormEvent) {
    event.preventDefault();

    if (paymentDisabled) {
      toast.error("Paiement indisponible pour cette facture.");
      return;
    }
    if (amount <= 0) {
      toast.error("Montant paiement invalide");
      return;
    }
    if (amount > invoiceBalance) {
      toast.error("Montant superieur au solde");
      return;
    }

    setSubmittingPayment(true);
    const res = await fetch(`/api/supplier-invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        method,
        paidAt: localDateTimeToIso(paidAt),
        reference: paymentReference || undefined
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur paiement fournisseur");
      setSubmittingPayment(false);
      return;
    }

    setFlashToast({ type: "success", message: "Paiement enregistre" });
    window.location.reload();
  }

  async function submitReturn(event: FormEvent) {
    event.preventDefault();

    if (returnDisabled) {
      toast.error("Retour indisponible pour cette facture.");
      return;
    }
    if (!selectedItem) {
      toast.error("Aucun produit disponible pour retour");
      return;
    }

    if (returnQty <= 0 || returnQty > selectedItem.remainingQtyHint) {
      toast.error("Quantite retour invalide");
      return;
    }

    if (returnAmount <= 0) {
      toast.error("Montant retour invalide");
      return;
    }

    const maxBySelected = round2(selectedItem.remainingQtyHint * selectedItem.unitCost);
    if (returnAmount > maxBySelected) {
      toast.error(`Montant retour trop eleve (max ${maxBySelected.toFixed(2)} DZD)`);
      return;
    }

    setSubmittingReturn(true);
    const res = await fetch(`/api/supplier-invoices/${invoiceId}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: localDateTimeToIso(returnDate),
        amount: returnAmount,
        note: returnNote || undefined,
        items: [{ productId: selectedItem.productId, qty: returnQty }]
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur retour fournisseur");
      setSubmittingReturn(false);
      return;
    }

    setFlashToast({ type: "success", message: "Retour fournisseur enregistre" });
    window.location.reload();
  }

  async function cancelInvoice() {
    const reason = window.prompt("Raison d'annulation de la facture ?");
    if (!reason) {
      toast.error("Annulation interrompue: raison requise.");
      return;
    }

    const res = await fetch(`/api/supplier-invoices/${invoiceId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur annulation facture fournisseur");
      return;
    }

    setFlashToast({ type: "success", message: "Facture fournisseur annulee" });
    window.location.reload();
  }

  return (
    <div className="action-stack">
      {canEditInvoice ? (
        <div className="card action-card action-toolbar">
          <div>Statut facture: {invoiceStatus}</div>
          <button className="btn" type="button" onClick={cancelInvoice}>
            Annuler facture
          </button>
        </div>
      ) : (
        <div className="card action-card">Facture annulee.</div>
      )}

      <form className="card action-card action-form" onSubmit={submitPayment}>
        <h3 className="section-title">Paiement facture fournisseur</h3>
        <div className="panel-note">
          Solde restant: {invoiceBalance.toFixed(2)} DZD | Solde apres paiement: {paymentBalanceAfter.toFixed(2)} DZD
        </div>
        <div className="inline-chip-actions">
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(1)} disabled={paymentDisabled}>
            Solde
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(0.5)} disabled={paymentDisabled}>
            50%
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setPaymentFromRatio(0.25)} disabled={paymentDisabled}>
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
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              disabled={paymentDisabled}
            />
          </label>
          <label>
            Mode
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled={paymentDisabled}>
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
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              required
              disabled={paymentDisabled}
            />
          </label>
        </div>
        <label>
          Reference (optionnel)
          <input
            className="input"
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="Num cheque, virement..."
            disabled={paymentDisabled}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={paymentDisabled}>
          {submittingPayment ? "Enregistrement..." : "Enregistrer paiement"}
        </button>
      </form>

      <form className="card action-card action-form" onSubmit={submitReturn}>
        <h3 className="section-title">Retour fournisseur</h3>
        {returnableItems.length === 0 ? <div className="detail-empty">Aucun article restant a retourner pour cette facture.</div> : null}
        {returnableItems.length ? (
          <table className="table table-tight">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Facture</th>
                <th>Retourne</th>
                <th>Restant</th>
              </tr>
            </thead>
            <tbody>
              {returnableItems.map((item) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td>{item.invoicedQty}</td>
                  <td>{item.returnedQty}</td>
                  <td>{item.remainingQtyHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="inline-chip-actions">
          <button className="btn btn-chip" type="button" onClick={() => setReturnQtyFromRatio(1)} disabled={returnDisabled}>
            Max
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setReturnQtyFromRatio(0.5)} disabled={returnDisabled}>
            50%
          </button>
          <button className="btn btn-chip" type="button" onClick={() => setReturnQtyFromRatio(0.25)} disabled={returnDisabled}>
            25%
          </button>
        </div>
        <div className="grid grid-3">
          <label>
            Produit
            <select
              className="input"
              value={returnProductId}
              onChange={(e) => setReturnProductId(e.target.value)}
              required
              disabled={returnDisabled}
            >
              {returnableItems.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {item.productName} (facture: {item.invoicedQty}, deja retourne: {item.returnedQty}, restant: {item.remainingQtyHint})
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantite retour
            <input
              className="input"
              type="number"
              min={0.01}
              step="0.01"
              value={returnQty}
              onChange={(e) => setReturnQty(Number(e.target.value || 0))}
              required
              disabled={returnDisabled || !selectedItem}
            />
          </label>
          <label>
            Montant retour
            <input
              className="input"
              type="number"
              min={0.01}
              step="0.01"
              value={returnAmount}
              onChange={(e) => setReturnAmount(Number(e.target.value || 0))}
              required
              disabled={returnDisabled || !selectedItem}
            />
          </label>
        </div>
        <div className="grid grid-3">
          <label>
            Date retour
            <input
              className="input"
              type="datetime-local"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              required
              disabled={returnDisabled}
            />
          </label>
          <label className="field-span-2">
            Note (optionnel)
            <input
              className="input"
              type="text"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Motif du retour"
              disabled={returnDisabled}
            />
          </label>
        </div>
        {selectedItem ? (
          <div className="panel-note">
            Max theorique sur article selectionne: {returnMaxAmount.toFixed(2)} DZD
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={returnDisabled || !selectedItem}>
          {submittingReturn ? "Enregistrement..." : "Enregistrer retour"}
        </button>
      </form>

    </div>
  );
}
