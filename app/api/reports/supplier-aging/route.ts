import { differenceInCalendarDays } from "date-fns";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";
import { bucketFromDaysOverdue, summarizeAgingBalances, type AgingBucket } from "@/lib/services/supplier-debt";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(auth.session.role)) {
    return fail("Acces refuse", 403);
  }

  const invoices = await db.supplierInvoice.findMany({
    where: {
      status: { in: ["UNPAID", "PARTIAL"] },
      balance: { gt: 0 }
    },
    include: { supplier: true },
    orderBy: { dueDate: "asc" }
  });

  const today = new Date();

  const details = invoices.map((invoice) => {
    const days = Math.max(0, differenceInCalendarDays(today, invoice.dueDate));
    const bucket: AgingBucket = bucketFromDaysOverdue(days);
    return {
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      dueDate: invoice.dueDate,
      daysOverdue: days,
      bucket,
      balance: invoice.balance
    };
  });

  const summary = summarizeAgingBalances(invoices.map((invoice) => ({ dueDate: invoice.dueDate, balance: invoice.balance })), today);

  const supplierSummaryMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      invoiceCount: number;
      totalBalance: number;
      "0-30": number;
      "31-60": number;
      "61+": number;
    }
  >();

  for (const row of details) {
    const current = supplierSummaryMap.get(row.supplierId) ?? {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      invoiceCount: 0,
      totalBalance: 0,
      "0-30": 0,
      "31-60": 0,
      "61+": 0
    };
    current.invoiceCount += 1;
    current.totalBalance += row.balance;
    current[row.bucket] += row.balance;
    supplierSummaryMap.set(row.supplierId, current);
  }

  const supplierSummary = Array.from(supplierSummaryMap.values())
    .map((row) => ({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      invoiceCount: row.invoiceCount,
      totalBalance: Number(row.totalBalance.toFixed(2)),
      "0-30": Number(row["0-30"].toFixed(2)),
      "31-60": Number(row["31-60"].toFixed(2)),
      "61+": Number(row["61+"].toFixed(2))
    }))
    .sort((a, b) => b.totalBalance - a.totalBalance);

  return ok({
    asOfDate: today,
    summary,
    supplierSummary,
    details
  });
}
