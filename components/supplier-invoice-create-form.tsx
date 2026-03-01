"use client";

import { FormEvent, useMemo, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Supplier = { id: string; code: string; name: string; paymentTermsDays: number };
type Product = { id: string; sku: string; name: string };
type POItemRemaining = {
  productId: string;
  productName: string;
  remainingQty: number;
  unitCost: number;
};
type PurchaseOrderOption = {
  id: string;
  number: string;
  supplierId: string;
  items: POItemRemaining[];
};

type InvoiceLine = { id: string; productId: string; qty: number; unitCost: number };

function newLine(): InvoiceLine {
  return {
    id: crypto.randomUUID(),
    productId: "",
    qty: 1,
    unitCost: 0
  };
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

function addDaysLocalDateTimeValue(base: string, days: number) {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) {
    return nowLocalDateTimeValue();
  }
  date.setDate(date.getDate() + days);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function SupplierInvoiceCreateForm({
  suppliers,
  products,
  purchaseOrders,
  embedded = false
}: {
  suppliers: Supplier[];
  products: Product[];
  purchaseOrders: PurchaseOrderOption[];
  embedded?: boolean;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([newLine()]);
  const [issueDate, setIssueDate] = useState(nowLocalDateTimeValue());
  const [dueDate, setDueDate] = useState(addDaysLocalDateTimeValue(nowLocalDateTimeValue(), 30));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const supplierPOs = useMemo(
    () => purchaseOrders.filter((po) => po.supplierId === supplierId),
    [purchaseOrders, supplierId]
  );

  const selectedPO = useMemo(
    () => supplierPOs.find((po) => po.id === purchaseOrderId),
    [supplierPOs, purchaseOrderId]
  );

  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === supplierId) ?? null, [suppliers, supplierId]);

  function updateLine(lineId: string, patch: Partial<InvoiceLine>) {
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

  const selectedPoTotalQty = selectedPO
    ? Number(selectedPO.items.reduce((sum, item) => sum + item.remainingQty, 0).toFixed(2))
    : 0;

  function applyDueDays(days: number) {
    setDueDate(addDaysLocalDateTimeValue(issueDate, days));
  }

  function onIssueDateChange(value: string) {
    setIssueDate(value);
    if (selectedSupplier) {
      setDueDate(addDaysLocalDateTimeValue(value, selectedSupplier.paymentTermsDays));
    }
  }

  function applyPurchaseOrder() {
    if (!selectedPO) {
      return;
    }

    const mapped = selectedPO.items
      .filter((item) => item.remainingQty > 0)
      .map((item) => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        qty: item.remainingQty,
        unitCost: item.unitCost
      }));

    setLines(mapped.length ? mapped : [newLine()]);
    setNotes((prev) => prev || `Facture liee au bon ${selectedPO.number}`);
  }

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

    const issueDateObject = new Date(issueDate);
    const dueDateObject = new Date(dueDate);
    if (Number.isNaN(issueDateObject.getTime()) || Number.isNaN(dueDateObject.getTime())) {
      toast.error("Dates facture invalides");
      return;
    }
    if (dueDateObject < issueDateObject) {
      toast.error("Date echeance doit etre posterieure a la date facture");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/supplier-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        purchaseOrderId: purchaseOrderId || undefined,
        issueDate: localDateTimeToIso(issueDate),
        dueDate: localDateTimeToIso(dueDate),
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
      toast.error(payload.error ?? "Erreur creation facture fournisseur");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Facture fournisseur creee" });
    window.location.reload();
  }

  return (
    <form className={embedded ? "action-card action-form" : "card action-card action-form form-block"} onSubmit={onSubmit}>
      <h3 className="section-title">Nouvelle facture fournisseur</h3>
      <p className="panel-note">
        Total facture: {total.toFixed(2)} DZD
        {selectedPO ? ` | PO ${selectedPO.number}: ${selectedPoTotalQty} restant` : ""}
      </p>
      <div className="grid grid-3">
        <label>
          Fournisseur
          <select
            className="input"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPurchaseOrderId("");
              const supplier = suppliers.find((entry) => entry.id === e.target.value);
              if (supplier) {
                setDueDate(addDaysLocalDateTimeValue(issueDate, supplier.paymentTermsDays));
              }
            }}
            required
            disabled={loading}
          >
            <option value="">Selectionner</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} - {supplier.name} ({supplier.paymentTermsDays}j)
              </option>
            ))}
          </select>
        </label>

        <label>
          Bon de commande (optionnel)
          <select
            className="input"
            value={purchaseOrderId}
            onChange={(e) => setPurchaseOrderId(e.target.value)}
            disabled={!supplierId || loading}
          >
            <option value="">Aucun</option>
            {supplierPOs.map((po) => (
              <option key={po.id} value={po.id}>
                {po.number}
              </option>
            ))}
          </select>
        </label>

        <div className="field-end">
          <button className="btn" type="button" onClick={applyPurchaseOrder} disabled={!selectedPO || loading}>
            Charger lignes PO
          </button>
        </div>
      </div>
      <div className="grid grid-3">
        <label>
          Date facture
          <input
            className="input"
            type="datetime-local"
            value={issueDate}
            onChange={(e) => onIssueDateChange(e.target.value)}
            required
            disabled={loading}
          />
        </label>
        <label>
          Date echeance
          <input className="input" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required disabled={loading} />
        </label>
        <div className="inline-chip-actions field-end">
          <button className="btn btn-chip" type="button" onClick={() => applyDueDays(15)} disabled={loading}>
            +15j
          </button>
          <button className="btn btn-chip" type="button" onClick={() => applyDueDays(30)} disabled={loading}>
            +30j
          </button>
          <button className="btn btn-chip" type="button" onClick={() => applyDueDays(45)} disabled={loading}>
            +45j
          </button>
        </div>
      </div>
      <label>
        Notes (optionnel)
        <input
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reference facture fournisseur, commentaire..."
          disabled={loading}
        />
      </label>

      {selectedPO ? (
        <table className="table table-tight">
          <thead>
            <tr>
              <th>Produit PO</th>
              <th>Restant</th>
              <th>Cout</th>
            </tr>
          </thead>
          <tbody>
            {selectedPO.items.map((item) => (
              <tr key={item.productId}>
                <td>{item.productName}</td>
                <td>{item.remainingQty}</td>
                <td>{item.unitCost.toFixed(2)} DZD</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

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
        <strong>Total facture: {total.toFixed(2)} DZD</strong>
      </div>

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Creation..." : "Creer facture fournisseur"}
      </button>
    </form>
  );
}
