import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { loginSchema } from "@/lib/validators/auth";
import { verifyPassword } from "@/lib/password";
import { signSessionToken, sessionCookieName } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Payload invalide", 400);
  }

  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !user.isActive) {
    return fail("Identifiants invalides", 401);
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return fail("Identifiants invalides", 401);
  }

  const token = signSessionToken({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  });

  const response = NextResponse.json({
    data: { userId: user.id, displayName: user.displayName, role: user.role },
    error: null
  });

  response.cookies.set({
    name: sessionCookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}