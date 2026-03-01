"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PatientModalForm, type PatientFormRecord } from "@/components/patient-modal-form";
import { PrescriptionCreateModal } from "@/components/prescription-create-modal";
import { useToast } from "@/components/toast-provider";

type ModalState =
  | { open: false; mode: "create"; patient: null }
  | { open: true; mode: "create"; patient: null }
  | { open: true; mode: "edit"; patient: PatientFormRecord };

function sortByNewest(patients: PatientFormRecord[]) {
  return [...patients].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });
}

export function PatientsWorkspace({
  initialPatients,
  hideSearch = false
}: {
  initialPatients: PatientFormRecord[];
  hideSearch?: boolean;
}) {
  const [patients, setPatients] = useState<PatientFormRecord[]>(sortByNewest(initialPatients));
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ open: false, mode: "create", patient: null });
  const [prescriptionPatient, setPrescriptionPatient] = useState<PatientFormRecord | null>(null);
  const toast = useToast();

  useEffect(() => {
    setPatients(sortByNewest(initialPatients));
  }, [initialPatients]);

  const visiblePatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return patients;
    }

    return patients.filter((patient) =>
      `${patient.code} ${patient.firstName} ${patient.lastName} ${patient.phone ?? ""}`.toLowerCase().includes(q)
    );
  }, [patients, search]);

  function openCreate() {
    setModal({ open: true, mode: "create", patient: null });
  }

  function openEdit(patient: PatientFormRecord) {
    setModal({ open: true, mode: "edit", patient });
  }

  function closeModal() {
    setModal({ open: false, mode: "create", patient: null });
  }

  function onSaved(saved: PatientFormRecord) {
    const createdMode = modal.mode === "create";
    setPatients((prev) => {
      const found = prev.some((item) => item.id === saved.id);
      if (!found) {
        return sortByNewest([{ ...saved, createdAt: saved.createdAt ?? new Date().toISOString() }, ...prev]);
      }
      return prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item));
    });

    toast.success(createdMode ? "Patient cree avec succes" : "Patient mis a jour");
    closeModal();
    if (createdMode) {
      setPrescriptionPatient(saved);
    }
  }

  return (
    <>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Nouveau patient
        </button>
        <Link href="/orders/new" className="btn">
          Nouvelle commande
        </Link>
        {!hideSearch ? (
          <input
            className="input patient-search-input"
            placeholder="Rechercher par code, nom ou telephone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        ) : null}
      </div>

      <div className="patients-meta-row">
        <span>Total patients: {patients.length}</span>
        {!hideSearch ? <span>Resultats affiches: {visiblePatients.length}</span> : null}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Nom</th>
            <th>Telephone</th>
            <th>Naissance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visiblePatients.length ? (
            visiblePatients.map((patient) => (
              <tr key={patient.id}>
                <td>{patient.code}</td>
                <td>
                  {patient.firstName} {patient.lastName}
                </td>
                <td>{patient.phone || "-"}</td>
                <td>{patient.birthDate ? patient.birthDate.slice(0, 10) : "-"}</td>
                <td className="row-actions">
                  <Link href={`/patients/${patient.id}`} className="table-link">
                    Voir
                  </Link>
                  <Link href={`/orders/new?patientId=${patient.id}`} className="table-link">
                    Commander
                  </Link>
                  <button type="button" className="btn" onClick={() => openEdit(patient)}>
                    Modifier
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucun patient trouve.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {modal.open ? (
        <PatientModalForm
          open={modal.open}
          mode={modal.mode}
          patient={modal.mode === "edit" ? modal.patient : null}
          onClose={closeModal}
          onSaved={onSaved}
        />
      ) : null}

      <PrescriptionCreateModal
        open={Boolean(prescriptionPatient)}
        patient={prescriptionPatient}
        onClose={() => setPrescriptionPatient(null)}
        onCreated={() => {
          toast.success("Ordonnance creee");
          setPrescriptionPatient(null);
        }}
      />
    </>
  );
}
