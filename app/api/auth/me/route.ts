import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireSession } from "@/lib/route-guard";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.response) {
    return fail("Non authentifie", 401);
  }

  return ok(auth.session);
}