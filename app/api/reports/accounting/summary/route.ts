import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import {
  ACCOUNTING_MAX_RANGE_DAYS,
  ADMIN_ONLY_MESSAGE,
  getAccountingSummaryReport,
  parseAccountingRange
} from "@/lib/services/accounting-report";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (auth.session.role !== "ADMIN") {
    return fail(ADMIN_ONLY_MESSAGE, 403);
  }

  const parsedRange = parseAccountingRange({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to")
  }, {
    maxDays: ACCOUNTING_MAX_RANGE_DAYS
  });

  if (parsedRange.error || !parsedRange.range) {
    return fail(parsedRange.error ?? "Parametres invalides", 400);
  }

  const report = await getAccountingSummaryReport(parsedRange.range);
  return ok(report, { rangeMaxDays: ACCOUNTING_MAX_RANGE_DAYS });
}
