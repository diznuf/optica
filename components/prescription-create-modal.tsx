"use client";

import { Modal } from "@/components/modal";
import { PrescriptionForm } from "@/components/prescription-form";
import type { PatientFormRecord } from "@/components/patient-modal-form";

export function PrescriptionCreateModal({
  open,
  patient,
  onClose,
  onCreated
}: {
  open: boolean;
  patient: PatientFormRecord | null;
  onClose: () => void;
  onCreated: (prescriptionId: string) => void;
}) {
  if (!open || !patient) {
    return null;
  }

  return (
    <Modal open={open} title={`Nouvelle ordonnance - ${patient.code}`} onClose={onClose}>
      <p className="modal-hint">
        Patient: {patient.firstName} {patient.lastName}
      </p>
      <PrescriptionForm patientId={patient.id} submitMode="create" onCreated={onCreated} showCard={false} />
    </Modal>
  );
}
