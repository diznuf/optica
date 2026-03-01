"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type ReceiveItem = {
  productId: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
};

export function PurchaseOrderReceiveForm({
  poId,
  poStatus,
  items
}: {
  poId: string;
  poStatus: string;
  items: ReceiveItem[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((item) => [item.productId, item.remainingQty]))
  );
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const canReceive = ["CONFIRMED", "RECEIVED"].includes(poStatus);
  const totalOrdered = Number(items.reduce((sum, item) => sum + item.orderedQty, 0).toFixed(2));
  const totalReceived = Number(items.reduce((sum, item) => sum + item.receivedQty, 0).toFixed(2));
  const totalRemaining = Number(items.reduce((sum, item) => sum + item.remainingQty, 0).toFixed(2));
  const selectedTotal = Number(
    items.reduce((sum, item) => sum + Math.max(0, Number(quantities[item.productId] ?? 0)), 0).toFixed(2)
  );

  function normalizeQty(rawValue: number, max: number) {
    if (!Number.isFinite(rawValue)) {
      return 0;
    }
    const bounded = Math.max(0, Math.min(rawValue, max));
    return Number(bounded.toFixed(2));
  }

  function setAllToRemaining() {
    setQuantities(Object.fromEntries(items.map((item) => [item.productId, item.remainingQty])));
  }

  function setAllToZero() {
    setQuantities(Object.fromEntries(items.map((item) => [item.productId, 0])));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canReceive) {
      toast.error("Le bon doit etre confirme avant reception.");
      return;
    }

    const payloadItems = items
      .map((item) => ({
        productId: item.productId,
        qty: Number(quantities[item.productId] ?? 0)
      }))
      .filter((item) => item.qty > 0);

    if (!payloadItems.length) {
      toast.error("Aucune quantite saisie pour reception");
      return;
    }

    setLoading(true);

    const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payloadItems })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur reception bon de commande");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Reception enregistree" });
    window.location.reload();
  }

  return (
    <form className="action-card action-form po-receive-form" onSubmit={onSubmit}>
      <h3 className="section-title">Reception partielle</h3>
      <div className="panel-note">
        Commande: {totalOrdered} | Deja recu: {totalReceived} | Restant: {totalRemaining} | Cette saisie: {selectedTotal}
      </div>
      <div className="inline-chip-actions">
        <button className="btn btn-chip" type="button" onClick={setAllToRemaining} disabled={!canReceive}>
          Tout restant
        </button>
        <button className="btn btn-chip" type="button" onClick={setAllToZero} disabled={!canReceive}>
          Tout a zero
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Commande</th>
            <th>Deja recu</th>
            <th>Restant</th>
            <th>A receptionner</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((item) => (
              <tr key={item.productId}>
                <td>{item.productName}</td>
                <td>{item.orderedQty}</td>
                <td>{item.receivedQty}</td>
                <td>{item.remainingQty}</td>
                <td>
                  <input
                    className="input input-inline-qty"
                    type="number"
                    min={0}
                    step="0.01"
                    max={item.remainingQty}
                    value={quantities[item.productId] ?? 0}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [item.productId]: normalizeQty(Number(e.target.value), item.remainingQty)
                      }))
                    }
                    disabled={item.remainingQty <= 0 || !canReceive}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucune ligne a receptionner.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!canReceive ? <p className="panel-note">Le bon doit etre confirme avant reception.</p> : null}
      <button className="btn btn-primary" type="submit" disabled={loading || !canReceive}>
        {loading ? "Reception..." : "Valider reception"}
      </button>
    </form>
  );
}
