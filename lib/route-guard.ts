import { ZodSchema } from "zod";
import { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { getRequestSession, Session } from "@/lib/auth";
import { Action, can, Resource } from "@/lib/permissions";

const anonymousSession: Session = {
  userId: "",
  username: "",
  displayName: "",
  role: "VENDEUR"
};

export function requireSession(request: NextRequest): { session: Session; response: ReturnType<typeof fail> | null } {
  const session = getRequestSession(request);
  if (!session) {
    return { session: anonymousSession, response: fail("Non authentifie", 401) };
  }
  return { session, response: null };
}

export function requirePermission(
  request: NextRequest,
  resource: Resource,
  action: Action
): { session: Session; response: ReturnType<typeof fail> | null } {
  const auth = requireSession(request);
  if (auth.response) {
    return auth;
  }

  if (!can(auth.session.role, action, resource)) {
    return { session: auth.session, response: fail("Acces refuse", 403) };
  }

  return auth;
}

export async function parseBody<T>(request: NextRequest, schema: ZodSchema<T>) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Payload invalide" };
  }
  return { data: parsed.data, error: null };
}
