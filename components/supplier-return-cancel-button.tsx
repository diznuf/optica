"use client";

import { setFlashToast, useToast } from "@/components/toast-provider";

export function SupplierReturnCancelButton({ returnId, status }: { returnId: string; status: string }) {
  const toast = useToast();

  async function cancelReturn() {
    if (status === "CANCELLED") {
      toast.info("Retour deja annule.");
      return;
    }

    const reason = window.prompt("Raison d'annulation du retour ?");
    if (!reason) {
      toast.error("Annulation interrompue: raison requise.");
      return;
    }

    const res = await fetch(`/api/supplier-returns/${returnId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur annulation retour");
      return;
    }

    setFlashToast({ type: "success", message: "Retour annule" });
    window.location.reload();
  }

  if (status === "CANCELLED") {
    return <span>Retour annule</span>;
  }

  return (
    <div className="return-action-row">
      <button className="btn" type="button" onClick={cancelReturn}>
        Annuler retour
      </button>
    </div>
  );
}
