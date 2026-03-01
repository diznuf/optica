import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "backups", "read");
  if (auth.response) {
    return auth.response;
  }

  const backups = await db.backupRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return ok(backups);
}