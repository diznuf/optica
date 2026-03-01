"use client";

import { useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

export function PurchaseOrderActions({ poId, status, canDelete }: { poId: string; status: string; canDelete?: boolean }) {
  const [pendingAction, setPendingAction] = useState<"confirm" | "receive" | "cancel" | "delete" | null>(null);
  const toast = useToast();

  async function act(action: "confirm" | "receive" | "cancel" | "delete") {
    let url = `/api/purchase-orders/${poId}/${action}`;
    let method = "POST";
    let body: string | undefined;

    if (pendingAction) {
      return;
    }

    if (action === "delete") {
      const okDelete = window.confirm("Supprimer ce bon brouillon ?");
      if (!okDelete) {
        return;
      }
      url = `/api/purchase-orders/${poId}`;
      method = "DELETE";
    }

    if (action === "cancel") {
      const reason = window.prompt("Raison d'annulation ?");
      if (!reason) {
        toast.error("Annulation interrompue: raison requise.");
        return;
      }
      body = JSON.stringify({ reason });
    }

    if (action === "receive") {
      const okReceive = window.confirm("Receptionner toutes les quantites restantes automatiquement ?");
      if (!okReceive) {
        return;
      }
    }

    setPendingAction(action);

    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur action BC");
      setPendingAction(null);
      return;
    }
    const successMessage =
      action === "confirm"
        ? "BC confirme"
        : action === "receive"
          ? "BC receptionne"
          : action === "cancel"
            ? "BC annule"
            : "BC supprime";
    setFlashToast({ type: "success", message: successMessage });
    window.location.reload();
  }

  const canConfirm = status === "DRAFT";
  const canReceiveAll = status === "CONFIRMED";
  const canCancel = status === "DRAFT" || status === "CONFIRMED";
  const canDeleteDraft = canDelete && status === "DRAFT";
  const hasAction = canConfirm || canReceiveAll || canCancel || canDeleteDraft;

  const statusHelp =
    status === "DRAFT"
      ? "Confirmez le bon pour activer les receptions."
      : status === "CONFIRMED"
        ? "Vous pouvez receptionner tout le restant en une action ou utiliser la reception partielle."
        : status === "RECEIVED"
          ? "Bon totalement receptionne."
          : status === "CANCELLED"
            ? "Bon annule: aucune action disponible."
            : "Aucune action disponible.";

  return (
    <div className="action-card">
      <div className="po-actions">
        {canConfirm ? (
          <button className="btn" type="button" onClick={() => act("confirm")} disabled={pendingAction !== null}>
            {pendingAction === "confirm" ? "Confirmation..." : "Confirmer"}
          </button>
        ) : null}
        {canReceiveAll ? (
          <button className="btn" type="button" onClick={() => act("receive")} disabled={pendingAction !== null}>
            {pendingAction === "receive" ? "Reception..." : "Receptionner tout"}
          </button>
        ) : null}
        {canCancel ? (
          <button className="btn" type="button" onClick={() => act("cancel")} disabled={pendingAction !== null}>
            {pendingAction === "cancel" ? "Annulation..." : "Annuler"}
          </button>
        ) : null}
        {canDeleteDraft ? (
          <button className="btn" type="button" onClick={() => act("delete")} disabled={pendingAction !== null}>
            {pendingAction === "delete" ? "Suppression..." : "Supprimer"}
          </button>
        ) : null}
        {!hasAction ? <span className="panel-note po-action-message">Aucune action disponible.</span> : null}
      </div>
      <p className="panel-note po-action-message">{statusHelp}</p>
    </div>
  );
}
