import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { parseBody, requirePermission } from "@/lib/route-guard";
import { userCreateSchema } from "@/lib/validators/user";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "users", "read");
  if (auth.response) {
    return auth.response;
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  return ok(users);
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "users", "write");
  if (auth.response) {
    return auth.response;
  }

  const body = await parseBody(request, userCreateSchema);
  if (body.error || !body.data) {
    return fail(body.error ?? "Payload invalide", 400);
  }

  const exists = await db.user.findUnique({ where: { username: body.data.username } });
  if (exists) {
    return fail("Nom utilisateur deja existe", 409);
  }

  const passwordHash = await hashPassword(body.data.password);

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: body.data.username,
        displayName: body.data.displayName,
        passwordHash,
        role: body.data.role,
        isActive: body.data.isActive
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    await logAudit(
      {
        actorUserId: auth.session.userId,
        action: "USER_CREATE",
        entity: "User",
        entityId: user.id,
        meta: { username: user.username, role: user.role }
      },
      tx
    );

    return user;
  });

  return ok(created, undefined, 201);
}