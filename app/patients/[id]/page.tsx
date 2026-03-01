import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrescriptionForm } from "@/components/prescription-form";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function PatientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      prescriptions: {
        include: { contactFits: true },
        orderBy: { examDate: "desc" }
      },
      orders: {
        orderBy: { orderDate: "desc" },
        take: 10
      }
    }
  });

  if (!patient) {
    notFound();
  }

  return (
    <AppShell session={session} title={`Patient ${patient.code}`}>
      <p>
        {patient.firstName} {patient.lastName} - {patient.phone ?? "sans telephone"}
      </p>
      <PrescriptionForm patientId={patient.id} submitMode="create" />
      <h3>Prescriptions</h3>
      <ul>
        {patient.prescriptions.map((p) => (
          <li key={p.id}>
            {p.examDate.toISOString().slice(0, 10)} - OD({p.odSph ?? "-"}/{p.odCyl ?? "-"}/{p.odAxis ?? "-"}) OS({p.osSph ?? "-"}/{p.osCyl ?? "-"}/{p.osAxis ?? "-"}) {" "}
            | PD({p.pdFar ?? "-"}/{p.pdNear ?? "-"}) {" "}
            {p.contactFits.length ? `| CL Fit ${p.contactFits.map((f) => `${f.eye}:${f.brand ?? "-"}`).join(", ")}` : ""}
            {" "}
            <Link href={`/prescriptions/${p.id}`}>Modifier</Link>
          </li>
        ))}
      </ul>
      <h3>Commandes recentes</h3>
      <ul>
        {patient.orders.map((o) => (
          <li key={o.id}>
            {o.number} - {o.status}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
