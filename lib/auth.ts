import { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

const SESSION_COOKIE = "optica_session";

export type Session = {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
};

type TokenPayload = Session & {
  iat: number;
  exp: number;
};

export function signSessionToken(session: Session): string {
  return jwt.sign(session, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): Session | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export function getRequestSession(request: NextRequest): Session | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export const sessionCookieName = SESSION_COOKIE;