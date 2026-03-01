"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Product = { id: string; sku: string; name: string };

const movementTypeLabels: Record<string, string> = {
  IN: "Entree",
  OUT: "Sortie",
  ADJUST: "Ajustement",
  RETURN_SUPPLIER: "Retour fournisseur"
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function StockMovementForm({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("IN");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [referenceType, setReferenceType] = useState("MANUAL");
  const [referenceId, setReferenceId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const requiresUnitCost = type === "IN" || type === "ADJUST";
  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  function setQtyPreset(value: number) {
    setQty(round2(Math.max(0.01, value)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!productId) {
      toast.error("Produit requis.");
      return;
    }
    if (qty <= 0) {
      toast.error("Quantite invalide.");
      return;
    }
    if (requiresUnitCost && unitCost < 0) {
      toast.error("Cout unitaire invalide.");
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      productId,
      type,
      qty,
      note: note || undefined,
      referenceType: referenceType || undefined,
      referenceId: referenceId || undefined
    };

    if (requiresUnitCost) {
      payload.unitCost = unitCost;
    }

    const res = await fetch("/api/stock/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Erreur mouvement stock");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Mouvement enregistre" });
    window.location.reload();
  }

  return (
    <form className="card action-card action-form form-block" onSubmit={onSubmit}>
      <h3 className="section-title">Nouveau mouvement stock</h3>
      <p className="panel-note">
        Type: {movementTypeLabels[type] ?? type}
        {selectedProduct ? ` | Produit: ${selectedProduct.sku} - ${selectedProduct.name}` : ""}
      </p>
      <div className="grid grid-3">
        <label>
          Produit
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={loading}>
            <option value="">Selectionner</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} - {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} disabled={loading}>
            <option value="IN">Entree (IN)</option>
            <option value="OUT">Sortie (OUT)</option>
            <option value="ADJUST">Ajustement (ADJUST)</option>
            <option value="RETURN_SUPPLIER">Retour fournisseur</option>
          </select>
        </label>
        <label>
          Quantite
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value || 0))}
            required
            disabled={loading}
          />
        </label>
      </div>
      <div className="inline-chip-actions">
        <button className="btn btn-chip" type="button" onClick={() => setQtyPreset(1)} disabled={loading}>
          1
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setQtyPreset(2)} disabled={loading}>
          2
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setQtyPreset(5)} disabled={loading}>
          5
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setQtyPreset(10)} disabled={loading}>
          10
        </button>
      </div>
      {requiresUnitCost ? (
        <label>
          Cout unitaire
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(Number(e.target.value || 0))}
            disabled={loading}
          />
        </label>
      ) : null}
      <div className="grid grid-3">
        <label>
          Reference type
          <select className="input" value={referenceType} onChange={(e) => setReferenceType(e.target.value)} disabled={loading}>
            <option value="MANUAL">MANUAL</option>
            <option value="INVENTORY">INVENTORY</option>
            <option value="CORRECTION">CORRECTION</option>
            <option value="SUPPLIER_RETURN">SUPPLIER_RETURN</option>
            <option value="OTHER">OTHER</option>
          </select>
        </label>
        <label className="field-span-2">
          Reference ID (optionnel)
          <input
            className="input"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="Numero document, reference externe..."
            disabled={loading}
          />
        </label>
      </div>
      <label>
        Note
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            type === "IN"
              ? "Ex: Entree inventaire initial"
              : type === "OUT"
                ? "Ex: Sortie exceptionnelle"
                : type === "ADJUST"
                  ? "Ex: Correction inventaire"
                  : "Ex: Retour vers fournisseur"
          }
          disabled={loading}
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : "Enregistrer mouvement"}
      </button>
    </form>
  );
}
