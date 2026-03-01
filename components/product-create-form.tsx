"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Category = { id: string; name: string };
type Supplier = { id: string; code: string; name: string };

export function ProductCreateForm({
  categories,
  suppliers,
  embedded = false
}: {
  categories: Category[];
  suppliers: Supplier[];
  embedded?: boolean;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unit, setUnit] = useState("piece");
  const [buyPrice, setBuyPrice] = useState(0);
  const [sellPrice, setSellPrice] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const margin = Number((sellPrice - buyPrice).toFixed(2));
  const marginRate = sellPrice > 0 ? Number(((margin / sellPrice) * 100).toFixed(1)) : 0;

  function setReorderPreset(value: number) {
    setReorderLevel(value);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!sku.trim() || !name.trim()) {
      toast.error("SKU et nom sont requis");
      return;
    }
    if (!categoryId) {
      toast.error("Categorie requise");
      return;
    }
    if (!unit.trim()) {
      toast.error("Unite requise");
      return;
    }
    if (buyPrice < 0 || sellPrice < 0 || reorderLevel < 0) {
      toast.error("Les valeurs prix/seuil doivent etre positives");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: sku.trim(),
        name: name.trim(),
        categoryId,
        supplierId: supplierId || undefined,
        unit: unit.trim(),
        buyPrice,
        sellPrice,
        reorderLevel,
        isActive
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur creation produit");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Produit cree" });
    window.location.reload();
  }

  return (
    <form className={embedded ? "action-card action-form" : "card action-card action-form form-block"} onSubmit={onSubmit}>
      <h3 className="section-title">Nouveau produit</h3>
      <p className="panel-note">
        Marge brute estimee: {margin.toFixed(2)} DZD ({marginRate}%)
      </p>
      <div className="grid grid-3">
        <label>
          SKU
          <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} required disabled={loading} />
        </label>
        <label>
          Nom
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required disabled={loading} />
        </label>
        <label>
          Unite
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} required disabled={loading} />
        </label>
      </div>
      <div className="grid grid-3">
        <label>
          Categorie
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required disabled={loading}>
            <option value="">Selectionner</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fournisseur
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={loading}>
            <option value="">Aucun</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} - {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seuil reappro
          <input
            className="input"
            type="number"
            step="0.01"
            value={reorderLevel}
            onChange={(e) => setReorderLevel(Number(e.target.value || 0))}
            required
            disabled={loading}
          />
        </label>
      </div>
      <div className="inline-chip-actions">
        <button className="btn btn-chip" type="button" onClick={() => setReorderPreset(0)} disabled={loading}>
          0
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setReorderPreset(2)} disabled={loading}>
          2
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setReorderPreset(5)} disabled={loading}>
          5
        </button>
        <button className="btn btn-chip" type="button" onClick={() => setReorderPreset(10)} disabled={loading}>
          10
        </button>
      </div>
      <div className="grid grid-3">
        <label>
          Prix achat
          <input
            className="input"
            type="number"
            step="0.01"
            value={buyPrice}
            onChange={(e) => setBuyPrice(Number(e.target.value || 0))}
            required
            disabled={loading}
          />
        </label>
        <label>
          Prix vente
          <input
            className="input"
            type="number"
            step="0.01"
            value={sellPrice}
            onChange={(e) => setSellPrice(Number(e.target.value || 0))}
            required
            disabled={loading}
          />
        </label>
      </div>
      {margin < 0 ? <p className="panel-note">Attention: marge negative (prix vente inferieur au prix achat).</p> : null}
      <label className="user-checkbox">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={loading} />
        Produit actif
      </label>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Creation..." : "Creer produit"}
      </button>
    </form>
  );
}
