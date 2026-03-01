"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast-provider";

export type PatientFormRecord = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt?: string;
};

type FieldState = {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  address: string;
  notes: string;
};

function emptyState(): FieldState {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    birthDate: "",
    address: "",
    notes: ""
  };
}

function normalizeBirthDateInput(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toApiPayload(fields: FieldState) {
  const payload: Record<string, string> = {
    firstName: fields.firstName.trim(),
    lastName: fields.lastName.trim(),
    phone: fields.phone.trim(),
    address: fields.address.trim(),
    notes: fields.notes.trim()
  };

  if (fields.birthDate.trim()) {
    payload.birthDate = `${fields.birthDate.trim()}T00:00:00.000Z`;
  }

  return payload;
}

export function PatientModalForm({
  open,
  mode,
  patient,
  onClose,
  onSaved
}: {
  open: boolean;
  mode: "create" | "edit";
  patient?: PatientFormRecord | null;
  onClose: () => void;
  onSaved: (patient: PatientFormRecord) => void;
}) {
  const [fields, setFields] = useState<FieldState>(emptyState);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && patient) {
      setFields({
        firstName: patient.firstName ?? "",
        lastName: patient.lastName ?? "",
        phone: patient.phone ?? "",
        birthDate: normalizeBirthDateInput(patient.birthDate),
        address: patient.address ?? "",
        notes: patient.notes ?? ""
      });
      return;
    }

    setFields(emptyState());
  }, [open, mode, patient]);

  const title = useMemo(
    () => (mode === "create" ? "Nouveau patient" : `Modifier patient ${patient?.code ?? ""}`.trim()),
    [mode, patient]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    const url = mode === "create" ? "/api/patients" : `/api/patients/${patient?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiPayload(fields))
    });

    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error ?? "Erreur patient");
      setLoading(false);
      return;
    }

    onSaved(payload.data as PatientFormRecord);
    setLoading(false);
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form className="grid patient-form-grid" onSubmit={onSubmit}>
        <div className="grid patient-form-two-columns">
          <label>
            Prenom
            <input
              className="input"
              value={fields.firstName}
              onChange={(event) => setFields((prev) => ({ ...prev, firstName: event.target.value }))}
              required
            />
          </label>
          <label>
            Nom
            <input
              className="input"
              value={fields.lastName}
              onChange={(event) => setFields((prev) => ({ ...prev, lastName: event.target.value }))}
              required
            />
          </label>
          <label>
            Telephone
            <input
              className="input"
              value={fields.phone}
              onChange={(event) => setFields((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Date de naissance
            <input
              className="input"
              type="date"
              value={fields.birthDate}
              onChange={(event) => setFields((prev) => ({ ...prev, birthDate: event.target.value }))}
            />
          </label>
          <label>
            Adresse
            <input
              className="input"
              value={fields.address}
              onChange={(event) => setFields((prev) => ({ ...prev, address: event.target.value }))}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            className="input"
            rows={3}
            value={fields.notes}
            onChange={(event) => setFields((prev) => ({ ...prev, notes: event.target.value }))}
          />
        </label>
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
