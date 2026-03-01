import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrescriptionForm } from "@/components/prescription-form";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function PrescriptionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;

  const prescription = await db.prescription.findUnique({
    where: { id },
    include: {
      patient: true,
      contactFits: true
    }
  });

  if (!prescription) {
    notFound();
  }

  return (
    <AppShell session={session} title={`Prescription ${prescription.patient.code}`}>
      <p>
        Patient: {prescription.patient.firstName} {prescription.patient.lastName}
      </p>
      <PrescriptionForm
        patientId={prescription.patientId}
        submitMode="edit"
        initial={{
          id: prescription.id,
          examDate: prescription.examDate.toISOString(),
          odSph: prescription.odSph,
          odCyl: prescription.odCyl,
          odAxis: prescription.odAxis,
          odAdd: prescription.odAdd,
          osSph: prescription.osSph,
          osCyl: prescription.osCyl,
          osAxis: prescription.osAxis,
          osAdd: prescription.osAdd,
          pdFar: prescription.pdFar,
          pdNear: prescription.pdNear,
          prism: prescription.prism,
          notes: prescription.notes,
          contactFits: prescription.contactFits.map((fit) => ({
            eye: fit.eye as "OD" | "OS",
            brand: fit.brand,
            power: fit.power,
            baseCurve: fit.baseCurve,
            diameter: fit.diameter,
            notes: fit.notes
          }))
        }}
      />
    </AppShell>
  );
}