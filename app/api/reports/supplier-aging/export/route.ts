import { differenceInCalendarDays } from "date-fns";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail } from "@/lib/api";
import { buildExcelResponse, type ExcelTable } from "@/lib/excel-export";
import { requirePermission } from "@/lib/route-guard";
import { bucketFromDaysOverdue, summarizeAgingBalances, type AgingBucket } from "@/lib/services/supplier-debt";

const allowedBuckets = new Set(["ALL", "0-30", "31-60", "61+"]);

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(auth.session.role)) {
    return fail("Acces refuse", 403);
  }

  const qValue = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const q = qValue.toLowerCase();
  const selectedBucketRaw = (request.nextUrl.searchParams.get("bucket") ?? "ALL").trim();
  const selectedBucket = allowedBuckets.has(selectedBucketRaw) ? selectedBucketRaw : "ALL";

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
    const daysOverdue = Math.max(0, differenceInCalendarDays(today, invoice.dueDate));
    const bucket: AgingBucket = bucketFromDaysOverdue(daysOverdue);
    return {
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      dueDate: invoice.dueDate,
      daysOverdue,
      bucket,
      balance: invoice.balance
    };
  });

  const filteredDetails = details.filter((row) => {
    const bucketMatch = selectedBucket !== "ALL" ? row.bucket === selectedBucket : true;
    if (!bucketMatch) {
      return false;
    }
    if (!q) {
      return true;
    }
    return `${row.supplierName} ${row.invoiceNumber}`.toLowerCase().includes(q);
  });

  const summary = summarizeAgingBalances(
    filteredDetails.map((row) => ({ dueDate: row.dueDate, balance: row.balance })),
    today
  );

  const supplierSummaryMap = new Map<
    string,
    {
      supplierName: string;
      invoiceCount: number;
      totalBalance: number;
      "0-30": number;
      "31-60": number;
      "61+": number;
    }
  >();

  for (const row of filteredDetails) {
    const current = supplierSummaryMap.get(row.supplierId) ?? {
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
      supplierName: row.supplierName,
      invoiceCount: row.invoiceCount,
      totalBalance: Number(row.totalBalance.toFixed(2)),
      "0-30": Number(row["0-30"].toFixed(2)),
      "31-60": Number(row["31-60"].toFixed(2)),
      "61+": Number(row["61+"].toFixed(2))
    }))
    .sort((a, b) => b.totalBalance - a.totalBalance);

  const tables: ExcelTable[] = [
    {
      title: "Resume global",
      columns: ["Bucket", "Montant (DZD)"],
      rows: [
        ["0-30", Number(summary["0-30"].toFixed(2))],
        ["31-60", Number(summary["31-60"].toFixed(2))],
        ["61+", Number(summary["61+"].toFixed(2))],
        ["Total", Number(summary.total.toFixed(2))]
      ]
    },
    {
      title: "Par fournisseur",
      columns: ["Fournisseur", "Factures", "0-30 (DZD)", "31-60 (DZD)", "61+ (DZD)", "Total (DZD)"],
      rows: supplierSummary.map((row) => [
        row.supplierName,
        row.invoiceCount,
        row["0-30"],
        row["31-60"],
        row["61+"],
        row.totalBalance
      ])
    },
    {
      title: "Par facture",
      columns: ["Fournisseur", "Facture", "Echeance", "Jours retard", "Bucket", "Solde (DZD)"],
      rows: filteredDetails.map((row) => [row.supplierName, row.invoiceNumber, row.dueDate, row.daysOverdue, row.bucket, row.balance])
    }
  ];

  const asOfDate = today.toISOString().slice(0, 10);

  return buildExcelResponse(`echeances-fournisseurs-${asOfDate}`, {
    title: "Echeances Fournisseurs",
    subtitle: "Export Excel",
    meta: [
      { label: "Date reference", value: asOfDate },
      { label: "Recherche", value: qValue || "Aucune" },
      { label: "Bucket", value: selectedBucket }
    ],
    tables
  });
}
