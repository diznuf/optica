import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { logAudit } from "@/lib/services/audit";
import { sequenceUpdateSchema } from "@/lib/validators/sequence";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "settings", "write");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = await parseBody(request, sequenceUpdateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const existing = await db.sequence.findUnique({ where: { id } });
  if (!existing) {
    return fail("Sequence introuvable", 404);
  }

  if (body.data.currentValue < existing.currentValue && !body.data.force) {
    return fail("Valeur inferieure detectee. Activez l'option force pour confirmer.", 409);
  }

  const updated = await db.$transaction(async (tx) => {
    const sequence = await tx.sequence.update({
      where: { id },
      data: { currentValue: body.data.currentValue }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "SEQUENCE_UPDATE",
        entity: "Sequence",
        entityId: id,
        meta: {
          type: sequence.type,
          previousValue: existing.currentValue,
          currentValue: body.data.currentValue,
          force: body.data.force
        }
      },
      tx
    );

    return sequence;
  });

  return ok(updated);
}
