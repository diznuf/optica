"use client";

import { FormEvent, useMemo, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string };
type POLine = { id: string; productId: string; qty: number; unitCost: number };

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

function newLine(): POLine {
  return {
    id: crypto.randomUUID(),
    productId: "",
    qty: 1,
    unitCost: 0
  };
}

export function PurchaseOrderCreateForm({
  suppliers,
  products,
  embedded = false
}: {
  suppliers: Supplier[];
  products: Product[];
  embedded?: boolean;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<POLine[]>([newLine()]);
  const [orderDate, setOrderDate] = useState(nowLocalDateTimeValue());
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  function updateLine(lineId: string, patch: Partial<POLine>) {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(lineId: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.id !== lineId)));
  }

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty * line.unitCost, 0),
    [lines]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!supplierId) {
      toast.error("Fournisseur requis");
      return;
    }

    if (lines.some((line) => !line.productId)) {
      toast.error("Chaque ligne doit contenir un produit");
      return;
    }

    if (lines.some((line) => line.qty <= 0 || line.unitCost < 0)) {
      toast.error("Quantite/cout invalide dans une ligne");
      return;
    }

    const uniqueProducts = new Set(lines.map((line) => line.productId));
    if (uniqueProducts.size !== lines.length) {
      toast.error("Produit en double detecte dans les lignes");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        orderDate: localDateTimeToIso(orderDate),
        expectedDate: expectedDate ? localDateTimeToIso(expectedDate) : undefined,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          unitCost: line.unitCost
        }))
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur creation BC");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Bon de commande cree" });
    window.location.reload();
  }

  return (
    <form className={embedded ? "action-card action-form" : "card action-card action-form form-block"} onSubmit={onSubmit}>
      <h3 className="section-title">Nouveau bon de commande</h3>
      <div className="grid grid-3">
        <label>
          Fournisseur
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required disabled={loading}>
            <option value="">Selectionner</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} - {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date commande
          <input
            className="input"
            type="datetime-local"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
            disabled={loading}
          />
        </label>
        <label>
          Date attendue (optionnel)
          <input
            className="input"
            type="datetime-local"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            disabled={loading}
          />
        </label>
      </div>
      <label>
        Notes (optionnel)
        <input
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Priorite, contrainte delai, commentaire..."
          disabled={loading}
        />
      </label>

      <div className="grid order-lines-grid">
        {lines.map((line, index) => (
          <div key={line.id} className="card order-line-card">
            <strong>Ligne {index + 1}</strong>
            <div className="grid grid-3">
              <label>
                Produit
                <select
                  className="input"
                  value={line.productId}
                  onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                  required
                  disabled={loading}
                >
                  <option value="">Selectionner</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku} - {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Quantite
                <input
                  className="input"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={line.qty}
                  onChange={(e) => updateLine(line.id, { qty: Number(e.target.value || 0) })}
                  required
                  disabled={loading}
                />
              </label>

              <label>
                Cout unitaire
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitCost}
                  onChange={(e) => updateLine(line.id, { unitCost: Number(e.target.value || 0) })}
                  required
                  disabled={loading}
                />
              </label>
            </div>

            <div className="order-line-footer">
              <span>Total ligne: {(line.qty * line.unitCost).toFixed(2)} DZD</span>
              <button className="btn" type="button" onClick={() => removeLine(line.id)} disabled={loading}>
                Supprimer ligne
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button className="btn" type="button" onClick={addLine} disabled={loading}>
          Ajouter ligne
        </button>
        <strong>Total BC: {total.toFixed(2)} DZD</strong>
      </div>

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Creation..." : "Creer BC"}
      </button>
    </form>
  );
}
