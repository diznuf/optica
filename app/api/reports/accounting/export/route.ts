import { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { buildExcelResponse, type ExcelTable } from "@/lib/excel-export";
import { requirePermission } from "@/lib/route-guard";
import {
  ACCOUNTING_MAX_RANGE_DAYS,
  ADMIN_ONLY_MESSAGE,
  getAccountingCashflowReport,
  getAccountingProfitReport,
  getAccountingPurchasesReport,
  getAccountingSalesReport,
  parseAccountingGroupBy,
  parseAccountingRange
} from "@/lib/services/accounting-report";

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  if (auth.session.role !== "ADMIN") {
    return fail(ADMIN_ONLY_MESSAGE, 403);
  }

  const parsedRange = parseAccountingRange(
    {
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to")
    },
    {
      maxDays: ACCOUNTING_MAX_RANGE_DAYS
    }
  );
  if (parsedRange.error || !parsedRange.range) {
    return fail(parsedRange.error ?? "Parametres invalides", 400);
  }

  const parsedGroupBy = parseAccountingGroupBy(request.nextUrl.searchParams.get("groupBy"));
  if (parsedGroupBy.error || !parsedGroupBy.groupBy) {
    return fail(parsedGroupBy.error ?? "Parametres invalides", 400);
  }

  const range = parsedRange.range;
  const groupBy = parsedGroupBy.groupBy;

  const [sales, purchases, profit, cashflow] = await Promise.all([
    getAccountingSalesReport(range, groupBy),
    getAccountingPurchasesReport(range),
    getAccountingProfitReport(range),
    getAccountingCashflowReport(range, groupBy)
  ]);

  const tables: ExcelTable[] = [
    {
      title: "KPI",
      columns: ["Indicateur", "Valeur"],
      rows: [
        ["Ventes (DZD)", sales.totals.salesAmount],
        ["Achats nets (DZD)", purchases.totals.netPurchases],
        ["Profit brut (DZD)", profit.totals.grossProfit],
        ["Marge brute (%)", profit.totals.grossMarginPct],
        ["Encaissements clients (DZD)", cashflow.totals.customerInflow],
        ["Cashflow net (DZD)", cashflow.totals.netCashflow]
      ]
    },
    {
      title: "Ventes par periode",
      columns: ["Periode", "Commandes", "Livrees", "Montant ventes (DZD)"],
      rows: sales.byPeriod.map((row) => [row.period, row.orderCount, row.deliveredOrderCount, row.salesAmount])
    },
    {
      title: "Cashflow par periode",
      columns: ["Periode", "Encaissements clients (DZD)", "Decaissements fournisseurs (DZD)", "Net (DZD)"],
      rows: cashflow.byPeriod.map((row) => [row.period, row.customerInflow, row.supplierOutflow, row.netCashflow])
    },
    {
      title: "Profit par vendeur",
      columns: ["Vendeur", "Commandes livrees", "CA (DZD)", "Cout CMV (DZD)", "Profit brut (DZD)", "Marge (%)"],
      rows: profit.bySeller.map((row) => [
        row.displayName,
        row.deliveredOrderCount,
        row.revenue,
        row.cogs,
        row.grossProfit,
        row.grossMarginPct
      ])
    },
    {
      title: "Categories ventes vs profit",
      columns: ["Categorie", "Ventes (DZD)", "Cout CMV (DZD)", "Profit brut (DZD)", "Marge (%)"],
      rows: profit.byCategory.map((row) => [row.category, row.revenue, row.cogs, row.grossProfit, row.grossMarginPct])
    },
    {
      title: "Fournisseurs achats",
      columns: ["Fournisseur", "Achats factures", "Retours", "Achats nets", "Paye", "Solde ouvert"],
      rows: purchases.bySupplier.map((row) => [
        row.supplierName,
        row.invoicedAmount,
        row.returnAmount,
        row.netPurchases,
        row.paidAmount,
        row.outstandingAmount
      ])
    },
    {
      title: "Achats par mois",
      columns: ["Periode", "Achats nets (DZD)", "Decaissements fournisseurs (DZD)"],
      rows: purchases.byMonth.map((row) => [row.period, row.netPurchases, row.supplierOutflow])
    },
    {
      title: "Ventes par categorie",
      columns: ["Categorie", "Ventes (DZD)", "Quantite", "Lignes"],
      rows: sales.byCategory.map((row) => [row.category, row.salesAmount, row.qty, row.lineCount])
    },
    {
      title: "Ventes par vendeur",
      columns: ["Vendeur", "Ventes (DZD)", "Commandes", "Livrees", "Ticket moyen (DZD)"],
      rows: sales.bySeller.map((row) => [row.displayName, row.salesAmount, row.orderCount, row.deliveredOrderCount, row.averageTicket])
    }
  ];

  const fromDate = toISODate(range.from);
  const toDate = toISODate(range.to);

  return buildExcelResponse(`comptabilite-${fromDate}-${toDate}`, {
    title: "Comptabilite",
    subtitle: "Export Excel",
    meta: [
      { label: "Du", value: fromDate },
      { label: "Au", value: toDate },
      { label: "Regroupement", value: groupBy }
    ],
    tables
  });
}
