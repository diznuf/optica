"use client";

import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { setFlashToast, useToast } from "@/components/toast-provider";

type SequenceRow = {
  id: string;
  type: string;
  currentValue: number;
  updatedAt: string;
};

export function SequencesAdminPanel({ sequences }: { sequences: SequenceRow[] }) {
  const [selected, setSelected] = useState<SequenceRow | null>(null);
  const [nextValue, setNextValue] = useState(0);
  const [force, setForce] = useState(false);
  const toast = useToast();

  const requiresForce = useMemo(() => {
    if (!selected) {
      return false;
    }
    return nextValue < selected.currentValue;
  }, [selected, nextValue]);

  function openEditor(sequence: SequenceRow) {
    setSelected(sequence);
    setNextValue(sequence.currentValue);
    setForce(false);
  }

  async function submitUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    if (!Number.isFinite(nextValue) || nextValue < 0 || !Number.isInteger(nextValue)) {
      toast.error("Valeur sequence invalide.");
      return;
    }

    const res = await fetch(`/api/admin/sequences/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentValue: nextValue, force })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error ?? "Mise a jour sequence impossible");
      return;
    }

    setFlashToast({ type: "success", message: "Sequence mise a jour" });
    window.location.reload();
  }

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Valeur actuelle</th>
            <th>Mise a jour</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sequences.length ? (
            sequences.map((sequence) => (
              <tr key={sequence.id}>
                <td>{sequence.type}</td>
                <td>{sequence.currentValue}</td>
                <td>{sequence.updatedAt.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <button className="btn" type="button" onClick={() => openEditor(sequence)}>
                    Modifier
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="table-empty-cell">
                Aucune sequence sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Edition sequence ${selected.type}` : "Edition sequence"}
        onClose={() => setSelected(null)}
      >
        <form className="grid user-form-grid" onSubmit={submitUpdate}>
          <div className="grid grid-3">
            <label>
              Type
              <input className="input" value={selected?.type ?? ""} disabled />
            </label>
            <label>
              Valeur actuelle
              <input className="input" value={selected?.currentValue ?? 0} disabled />
            </label>
            <label>
              Nouvelle valeur
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={nextValue}
                onChange={(event) => setNextValue(Number(event.target.value))}
                required
              />
            </label>
          </div>

          {requiresForce ? (
            <label className="user-checkbox">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              Confirmer la baisse de sequence (risque de collision si des documents existent deja)
            </label>
          ) : null}

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={requiresForce && !force}>
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
