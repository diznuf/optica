import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { patientCreateSchema } from "@/lib/validators/patient";
import { nextSequence } from "@/lib/services/sequence";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "patients", "read");
  if (auth.response) {
    return auth.response;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const patients = await db.patient.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { code: { contains: q } },
            { phone: { contains: q } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return ok(patients);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "patients", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, patientCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const created = await db.$transaction(async (tx) => {
    const code = await nextSequence("PATIENT", tx);
    const patient = await tx.patient.create({
      data: {
        code,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        phone: body.data.phone || null,
        email: body.data.email || null,
        birthDate: body.data.birthDate ? new Date(body.data.birthDate) : null,
        address: body.data.address || null,
        notes: body.data.notes || null
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "PATIENT_CREATE",
        entity: "Patient",
        entityId: patient.id,
        meta: { code: patient.code }
      },
      tx
    );

    return patient;
  });

  return ok(created, undefined, 201);
}