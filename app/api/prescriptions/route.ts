import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { prescriptionCreateSchema } from "@/lib/validators/prescription";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "prescriptions", "read");
  if (auth.response) {
    return auth.response;
  }

  const patientId = request.nextUrl.searchParams.get("patientId");
  const data = await db.prescription.findMany({
    where: patientId ? { patientId } : undefined,
    include: {
      patient: true,
      contactFits: true
    },
    orderBy: { examDate: "desc" },
    take: 100
  });

  return ok(data);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "prescriptions", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, prescriptionCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const patient = await db.patient.findUnique({ where: { id: body.data.patientId } });
  if (!patient) {
    return fail("Patient introuvable", 404);
  }

  const created = await db.$transaction(async (tx) => {
    const prescription = await tx.prescription.create({
      data: {
        patientId: body.data.patientId,
        examDate: new Date(body.data.examDate),
        odSph: body.data.odSph,
        odCyl: body.data.odCyl,
        odAxis: body.data.odAxis,
        odAdd: body.data.odAdd,
        osSph: body.data.osSph,
        osCyl: body.data.osCyl,
        osAxis: body.data.osAxis,
        osAdd: body.data.osAdd,
        pdFar: body.data.pdFar,
        pdNear: body.data.pdNear,
        prism: body.data.prism,
        notes: body.data.notes,
        contactFits: {
          create: (body.data.contactFits ?? []).map((fit) => ({
            eye: fit.eye,
            brand: fit.brand,
            power: fit.power,
            baseCurve: fit.baseCurve,
            diameter: fit.diameter,
            notes: fit.notes
          }))
        }
      },
      include: { contactFits: true }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PRESCRIPTION_CREATE",
        entity: "Prescription",
        entityId: prescription.id,
        meta: { patientId: body.data.patientId }
      },
      tx
    );

    return prescription;
  });

  return ok(created, undefined, 201);
}