import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { patientUpdateSchema } from "@/lib/validators/patient";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "patients", "read");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      prescriptions: {
        orderBy: { examDate: "desc" },
        include: { contactFits: true }
      }
    }
  });

  if (!patient) {
    return fail("Patient introuvable", 404);
  }

  return ok(patient);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "patients", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, patientUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const exists = await db.patient.findUnique({ where: { id } });
  if (!exists) {
    return fail("Patient introuvable", 404);
  }

  const updated = await db.$transaction(async (tx) => {
    const patient = await tx.patient.update({
      where: { id },
      data: {
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        phone: body.data.phone,
        email: body.data.email,
        birthDate: body.data.birthDate ? new Date(body.data.birthDate) : undefined,
        address: body.data.address,
        notes: body.data.notes
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PATIENT_UPDATE",
        entity: "Patient",
        entityId: id
      },
      tx
    );

    return patient;
  });

  return ok(updated);
}