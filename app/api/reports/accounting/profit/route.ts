import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import {
  ACCOUNTING_MAX_RANGE_DAYS,
  ADMIN_ONLY_MESSAGE,
  getAccountingProfitReport,
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

  const report = await getAccountingProfitReport(parsedRange.range);
  const byCategory = paginateRows(report.byCategory, parsedPagination.pagination);
  const bySeller = paginateRows(report.bySeller, parsedPagination.pagination);

  return ok(
    {
      ...report,
      byCategory: byCategory.items,
      bySeller: bySeller.items
    },
    {
      rangeMaxDays: ACCOUNTING_MAX_RANGE_DAYS,
      pagination: {
        byCategory: {
          total: byCategory.total,
          page: byCategory.page,
          pageSize: byCategory.pageSize,
          totalPages: byCategory.totalPages
        },
        bySeller: {
          total: bySeller.total,
          page: bySeller.page,
          pageSize: bySeller.pageSize,
          totalPages: bySeller.totalPages
        }
      }
    }
  );
}
