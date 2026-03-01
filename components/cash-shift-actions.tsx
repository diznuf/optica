"use client";

import { FormEvent, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type OpenShiftInfo = {
  id: string;
  openedAt: string;
  openingCash: number;
  cashCollected: number;
  expectedCash: number;
};

export function CashShiftActions({
  openShift,
  canManage
}: {
  openShift: OpenShiftInfo | null;
  canManage: boolean;
}) {
  const [openingCash, setOpeningCash] = useState(0);
  const [openNote, setOpenNote] = useState("");
  const [closingCashDeclared, setClosingCashDeclared] = useState(openShift?.expectedCash ?? 0);
  const [closeNote, setCloseNote] = useState("");
  const toast = useToast();

  if (!canManage) {
    return null;
  }

  async function handleOpenShift(event: FormEvent) {
    event.preventDefault();

    const res = await fetch("/api/reports/daily-cash/shift/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openingCash,
        note: openNote || undefined
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur ouverture caisse");
      return;
    }

    setFlashToast({ type: "success", message: "Caisse ouverte" });
    window.location.reload();
  }

  async function handleCloseShift(event: FormEvent) {
    event.preventDefault();

    const res = await fetch("/api/reports/daily-cash/shift/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closingCashDeclared,
        note: closeNote || undefined
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur cloture caisse");
      return;
    }

    setFlashToast({ type: "success", message: "Caisse cloturee" });
    window.location.reload();
  }

  if (!openShift) {
    return (
      <form className="card action-card action-form" onSubmit={handleOpenShift}>
        <h3 className="section-title">Ouvrir ma caisse</h3>
        <div className="grid grid-3">
          <label>
            Fond initial (DZD)
            <input className="input" type="number" min={0} step="0.01" value={openingCash} onChange={(e) => setOpeningCash(Number(e.target.value))} required />
          </label>
          <label className="field-span-2">
            Note (optionnel)
            <input className="input" value={openNote} onChange={(e) => setOpenNote(e.target.value)} placeholder="Observation ouverture" />
          </label>
        </div>
        <button className="btn btn-primary" type="submit">
          Ouvrir caisse
        </button>
      </form>
    );
  }

  return (
    <form className="card action-card action-form" onSubmit={handleCloseShift}>
      <h3 className="section-title">Cloturer ma caisse</h3>
      <p className="panel-note">
        Ouverte le {openShift.openedAt}. Fond: {openShift.openingCash.toFixed(2)} DZD. Encaisse cash: {openShift.cashCollected.toFixed(2)} DZD.
        Attendu: <strong>{openShift.expectedCash.toFixed(2)} DZD</strong>.
      </p>
      <div className="grid grid-3">
        <label>
          Caisse comptee (DZD)
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={closingCashDeclared}
            onChange={(e) => setClosingCashDeclared(Number(e.target.value))}
            required
          />
        </label>
        <label className="field-span-2">
          Note cloture (optionnel)
          <input className="input" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Observation cloture" />
        </label>
      </div>
      <button className="btn btn-primary" type="submit">
        Cloturer caisse
      </button>
    </form>
  );
}
