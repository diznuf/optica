"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

export function SupplierCreateForm({ embedded = false }: { embedded?: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  function applyTerms(value: number) {
    setPaymentTermsDays(value);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Nom fournisseur requis");
      return;
    }
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays <= 0) {
      toast.error("Delai de paiement invalide");
      return;
    }
    if (!Number.isFinite(openingBalance)) {
      toast.error("Solde initial invalide");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        paymentTermsDays,
        openingBalance,
        isActive
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur creation fournisseur");
      setLoading(false);
      return;
    }

    setFlashToast({ type: "success", message: "Fournisseur cree" });
    window.location.reload();
  }

  return (
    <form className={embedded ? "action-card action-form" : "card action-card action-form form-block"} onSubmit={onSubmit}>
      <h3 className="section-title">Nouveau fournisseur</h3>
      <p className="panel-note">Ajoutez les informations de profil et les conditions de paiement par defaut.</p>
      <div className="grid grid-3">
        <label>
          Nom
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required disabled={loading} />
        </label>
        <label>
          Telephone
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} />
        </label>
        <label>
          Email (optionnel)
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        </label>
      </div>
      <label>
        Adresse (optionnel)
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} disabled={loading} />
      </label>
      <div className="grid grid-3">
        <label>
          Delai paiement (jours)
          <input
            className="input"
            type="number"
            min={1}
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
            required
            disabled={loading}
          />
        </label>
        <div className="inline-chip-actions field-end">
          <button className="btn btn-chip" type="button" onClick={() => applyTerms(15)} disabled={loading}>
            15j
          </button>
          <button className="btn btn-chip" type="button" onClick={() => applyTerms(30)} disabled={loading}>
            30j
          </button>
          <button className="btn btn-chip" type="button" onClick={() => applyTerms(45)} disabled={loading}>
            45j
          </button>
          <button className="btn btn-chip" type="button" onClick={() => applyTerms(60)} disabled={loading}>
            60j
          </button>
        </div>
      </div>
      <label>
        Solde initial (DZD)
        <input
          className="input"
          type="number"
          step="0.01"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(Number(e.target.value))}
          disabled={loading}
        />
      </label>
      <label className="user-checkbox">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={loading} />
        Fournisseur actif
      </label>
      <p className="panel-note">Solde initial &gt; 0 = dette d'ouverture.</p>
      <button className="btn btn-primary" disabled={loading} type="submit">
        {loading ? "Creation..." : "Creer fournisseur"}
      </button>
    </form>
  );
}
