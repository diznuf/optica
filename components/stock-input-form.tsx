"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type ProductOption = {
  id: string;
  sku: string;
  name: string;
};

export function StockInputForm({ products, embedded = false }: { products: ProductOption[]; embedded?: boolean }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    const res = await fetch("/api/stock/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        type: "IN",
        qty,
        unitCost,
        note: note || "Entree rapide stock"
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur entree stock");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Entree stock enregistree" });
    window.location.reload();
  }

  return (
    <form className={embedded ? "action-card action-form" : "card action-card action-form form-block"} onSubmit={onSubmit}>
      <h3 className="section-title">Entree stock rapide</h3>
      <div className="grid grid-3">
        <label>
          Produit
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Selectionner</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} - {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantite entree
          <input className="input" type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
        </label>
        <label>
          Cout unitaire
          <input className="input" type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} required />
        </label>
      </div>
      <label>
        Note
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : "Ajouter au stock"}
      </button>
    </form>
  );
}
