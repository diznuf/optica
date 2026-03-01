import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import {
  ACCOUNTING_MAX_RANGE_DAYS,
  ADMIN_ONLY_MESSAGE,
  getAccountingPurchasesReport,
  paginateRows,
  parseAccountingPagination,
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

  const parsedPagination = parseAccountingPagination({
    page: request.nextUrl.searchParams.get("page"),
    pageSize: request.nextUrl.searchParams.get("pageSize")
  });
  if (parsedPagination.error || !parsedPagination.pagination) {
    return fail(parsedPagination.error ?? "Parametres invalides", 400);
  }

  const report = await getAccountingPurchasesReport(parsedRange.range);
  const byMonth = paginateRows(report.byMonth, parsedPagination.pagination);
  const bySupplier = paginateRows(report.bySupplier, parsedPagination.pagination);

  return ok(
    {
      ...report,
      byMonth: byMonth.items,
      bySupplier: bySupplier.items
    },
    {
      rangeMaxDays: ACCOUNTING_MAX_RANGE_DAYS,
      pagination: {
        byMonth: {
          total: byMonth.total,
          page: byMonth.page,
          pageSize: byMonth.pageSize,
          totalPages: byMonth.totalPages
        },
        bySupplier: {
          total: bySupplier.total,
          page: bySupplier.page,
          pageSize: bySupplier.pageSize,
          totalPages: bySupplier.totalPages
        }
      }
    }
  );
}
