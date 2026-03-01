"use client";

import { setFlashToast, useToast } from "@/components/toast-provider";

export function OrderPaymentCancelButton({
  orderId,
  paymentId
}: {
  orderId: string;
  paymentId: string;
}) {
  const toast = useToast();

  async function cancelPayment() {
    const reason = window.prompt("Raison d'annulation du paiement client ?");
    if (!reason) {
      toast.error("Annulation interrompue: raison requise.");
      return;
    }

    const res = await fetch(`/api/orders/${orderId}/payments/${paymentId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur annulation paiement client");
      return;
    }

    setFlashToast({ type: "success", message: "Paiement client annule" });
    window.location.reload();
  }

  return (
    <button className="btn btn-chip" type="button" onClick={cancelPayment}>
      Annuler paiement
    </button>
  );
}
