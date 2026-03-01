import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { prescriptionUpdateSchema } from "@/lib/validators/prescription";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "prescriptions", "read");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const prescription = await db.prescription.findUnique({
    where: { id },
    include: {
      patient: true,
      contactFits: true
    }
  });

  if (!prescription) {
    return fail("Prescription introuvable", 404);
  }

  return ok(prescription);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "prescriptions", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, prescriptionUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existing = await db.prescription.findUnique({ where: { id }, include: { contactFits: true } });
  if (!existing) {
    return fail("Prescription introuvable", 404);
  }

  const updated = await db.$transaction(async (tx) => {
    if (body.data.contactFits) {
      await tx.contactLensFit.deleteMany({ where: { prescriptionId: id } });
    }

    const prescription = await tx.prescription.update({
      where: { id },
      data: {
        examDate: body.data.examDate ? new Date(body.data.examDate) : undefined,
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
        contactFits: body.data.contactFits
          ? {
              create: body.data.contactFits.map((fit) => ({
                eye: fit.eye,
                brand: fit.brand,
                power: fit.power,
                baseCurve: fit.baseCurve,
                diameter: fit.diameter,
                notes: fit.notes
              }))
            }
          : undefined
      },
      include: { patient: true, contactFits: true }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PRESCRIPTION_UPDATE",
        entity: "Prescription",
        entityId: id
      },
      tx
    );

    return prescription;
  });

  return ok(updated);
}
