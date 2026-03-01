import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import {
  ACCOUNTING_DEFAULT_PAGE_SIZE,
  ACCOUNTING_MAX_RANGE_DAYS,
  getAccountingCashflowReport,
  getAccountingProfitReport,
  getAccountingPurchasesReport,
  getAccountingSalesReport,
  paginateRows,
  parseAccountingGroupBy,
  parseAccountingPagination,
  parseAccountingRange
} from "@/lib/services/accounting-report";

const pageSizeOptions = [20, 40, 80, 120, 200];

function readParam(input: string | string[] | undefined) {
  if (!input) {
    return "";
  }
  return Array.isArray(input) ? input[0] ?? "" : input;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPct(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

export default async function AccountingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (session.role !== "ADMIN") {
    return (
      <AppShell session={session} title="Comptabilite">
        <p>Acces reserve a l'administrateur.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const rawFrom = readParam(params.from).trim();
  const rawTo = readParam(params.to).trim();
  const rawGroupBy = readParam(params.groupBy).trim();
  const rawPage = readParam(params.page).trim();
  const rawPageSize = readParam(params.pageSize).trim();

  const defaultRangeResult = parseAccountingRange({}, { maxDays: ACCOUNTING_MAX_RANGE_DAYS });
  const defaultRange = defaultRangeResult.range ?? { from: new Date(), to: new Date() };
  const defaultPaginationResult = parseAccountingPagination({});
  const defaultPagination = defaultPaginationResult.pagination ?? { page: 1, pageSize: ACCOUNTING_DEFAULT_PAGE_SIZE, offset: 0 };

  const parsedRange = parseAccountingRange(
    {
      from: rawFrom || null,
      to: rawTo || null
    },
    {
      maxDays: ACCOUNTING_MAX_RANGE_DAYS
    }
  );
  const range = parsedRange.range ?? defaultRange;

  const parsedGroupBy = parseAccountingGroupBy(rawGroupBy || null);
  const groupBy = parsedGroupBy.groupBy ?? "day";

  const parsedPagination = parseAccountingPagination({
    page: rawPage || null,
    pageSize: rawPageSize || null
  });
  const pagination = parsedPagination.pagination ?? defaultPagination;

  const warnings = [parsedRange.error, parsedGroupBy.error, parsedPagination.error].filter(Boolean);
  const fromInput = toDateInput(range.from);
  const toInput = toDateInput(range.to);
  const exportParams = new URLSearchParams();
  exportParams.set("from", fromInput);
  exportParams.set("to", toInput);
  exportParams.set("groupBy", groupBy);
  const exportHref = `/api/reports/accounting/export?${exportParams.toString()}`;

  const [sales, purchases, profit, cashflow] = await Promise.all([
    getAccountingSalesReport(range, groupBy),
    getAccountingPurchasesReport(range),
    getAccountingProfitReport(range),
    getAccountingCashflowReport(range, groupBy)
  ]);

  const salesByPeriod = paginateRows(sales.byPeriod, pagination);
  const salesByCategory = paginateRows(sales.byCategory, pagination);
  const salesBySeller = paginateRows(sales.bySeller, pagination);
  const purchasesByMonth = paginateRows(purchases.byMonth, pagination);
  const purchasesBySupplier = paginateRows(purchases.bySupplier, pagination);
  const profitBySeller = paginateRows(profit.bySeller, pagination);
  const profitByCategory = paginateRows(profit.byCategory, pagination);
  const cashflowByPeriod = paginateRows(cashflow.byPeriod, pagination);

  const globalTotalPages = Math.max(
    salesByPeriod.totalPages,
    salesByCategory.totalPages,
    salesBySeller.totalPages,
    purchasesByMonth.totalPages,
    purchasesBySupplier.totalPages,
    profitBySeller.totalPages,
    profitByCategory.totalPages,
    cashflowByPeriod.totalPages
  );
  const globalPage = Math.min(pagination.page, globalTotalPages);

  function buildHref(page: number) {
    const next = new URLSearchParams();
    next.set("from", fromInput);
    next.set("to", toInput);
    next.set("groupBy", groupBy);
    next.set("pageSize", String(pagination.pageSize));
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/reports/accounting?${query}` : "/reports/accounting";
  }

  return (
    <AppShell session={session} title="Comptabilite">
      <form className="page-filter-form" method="GET">
        <label>
          Du
          <input className="input" type="date" name="from" defaultValue={fromInput} />
        </label>
        <label>
          Au
          <input className="input" type="date" name="to" defaultValue={toInput} />
        </label>
        <label>
          Regroupement
          <select className="input" name="groupBy" defaultValue={groupBy}>
            <option value="day">Jour</option>
            <option value="week">Semaine</option>
            <option value="month">Mois</option>
          </select>
        </label>
        <label>
          Lignes / tableau
          <select className="input" name="pageSize" defaultValue={String(pagination.pageSize)}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/reports/accounting" className="btn">
          Reinitialiser
        </Link>
        <Link href={exportHref} className="btn">
          Exporter Excel
        </Link>
      </form>

      {warnings.length ? (
        <p className="info-text">
          Parametres ajustes automatiquement: {warnings.join(" | ")}.
        </p>
      ) : null}

      <p className="panel-note">Plage maximale autorisee: {ACCOUNTING_MAX_RANGE_DAYS} jours.</p>

      <div className="table-toolbar">
        <div className="table-meta">
          Pagination globale: page {globalPage}/{globalTotalPages} - {pagination.pageSize} lignes par tableau
        </div>
        <div className="pagination-controls">
          {globalPage > 1 ? (
            <Link href={buildHref(globalPage - 1)} className="btn">
              Precedent
            </Link>
          ) : (
            <span className="btn btn-disabled">Precedent</span>
          )}
          {globalPage < globalTotalPages ? (
            <Link href={buildHref(globalPage + 1)} className="btn">
              Suivant
            </Link>
          ) : (
            <span className="btn btn-disabled">Suivant</span>
          )}
        </div>
      </div>

      <div className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Ventes</div>
          <strong className="metric-value">{formatDZD(sales.totals.salesAmount)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Achats nets</div>
          <strong className="metric-value">{formatDZD(purchases.totals.netPurchases)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Profit brut</div>
          <strong className="metric-value">{formatDZD(profit.totals.grossProfit)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Marge brute</div>
          <strong className="metric-value">{formatPct(profit.totals.grossMarginPct)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Encaissements clients</div>
          <strong className="metric-value">{formatDZD(cashflow.totals.customerInflow)}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Cashflow net</div>
          <strong className="metric-value">{formatDZD(cashflow.totals.netCashflow)}</strong>
        </article>
      </div>

      <h3>Ventes par periode</h3>
      <p className="panel-note">
        Lignes affichees: {salesByPeriod.items.length}/{salesByPeriod.total} (page {salesByPeriod.page}/{salesByPeriod.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Periode</th>
            <th>Commandes</th>
            <th>Livrees</th>
            <th>Montant ventes</th>
          </tr>
        </thead>
        <tbody>
          {salesByPeriod.items.length ? (
            salesByPeriod.items.map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td>{row.orderCount}</td>
                <td>{row.deliveredOrderCount}</td>
                <td>{formatDZD(row.salesAmount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="table-empty-cell">
                Aucune vente pour cette periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Cashflow par periode</h3>
      <p className="panel-note">
        Lignes affichees: {cashflowByPeriod.items.length}/{cashflowByPeriod.total} (page {cashflowByPeriod.page}/{cashflowByPeriod.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Periode</th>
            <th>Encaissements clients</th>
            <th>Decaissements fournisseurs</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {cashflowByPeriod.items.length ? (
            cashflowByPeriod.items.map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td>{formatDZD(row.customerInflow)}</td>
                <td>{formatDZD(row.supplierOutflow)}</td>
                <td>{formatDZD(row.netCashflow)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="table-empty-cell">
                Aucun flux sur cette periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Profit par vendeur</h3>
      <p className="panel-note">
        Lignes affichees: {profitBySeller.items.length}/{profitBySeller.total} (page {profitBySeller.page}/{profitBySeller.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Vendeur</th>
            <th>Commandes livrees</th>
            <th>CA</th>
            <th>Cout (CMV)</th>
            <th>Profit brut</th>
            <th>Marge</th>
          </tr>
        </thead>
        <tbody>
          {profitBySeller.items.length ? (
            profitBySeller.items.map((row) => (
              <tr key={row.userId}>
                <td>{row.displayName}</td>
                <td>{row.deliveredOrderCount}</td>
                <td>{formatDZD(row.revenue)}</td>
                <td>{formatDZD(row.cogs)}</td>
                <td>{formatDZD(row.grossProfit)}</td>
                <td>{formatPct(row.grossMarginPct)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="table-empty-cell">
                Aucun profit calcule pour cette periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Categories (ventes vs profit)</h3>
      <p className="panel-note">
        Lignes affichees: {profitByCategory.items.length}/{profitByCategory.total} (page {profitByCategory.page}/{profitByCategory.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Categorie</th>
            <th>Ventes</th>
            <th>Cout (CMV)</th>
            <th>Profit brut</th>
            <th>Marge</th>
          </tr>
        </thead>
        <tbody>
          {profitByCategory.items.length ? (
            profitByCategory.items.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td>{formatDZD(row.revenue)}</td>
                <td>{formatDZD(row.cogs)}</td>
                <td>{formatDZD(row.grossProfit)}</td>
                <td>{formatPct(row.grossMarginPct)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucune donnee categorie pour cette periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Fournisseurs (achats)</h3>
      <p className="panel-note">
        Lignes affichees: {purchasesBySupplier.items.length}/{purchasesBySupplier.total} (page {purchasesBySupplier.page}/{purchasesBySupplier.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Achats factures</th>
            <th>Retours</th>
            <th>Achats nets</th>
            <th>Paye</th>
            <th>Solde ouvert</th>
          </tr>
        </thead>
        <tbody>
          {purchasesBySupplier.items.length ? (
            purchasesBySupplier.items.map((row) => (
              <tr key={row.supplierId}>
                <td>{row.supplierName}</td>
                <td>{formatDZD(row.invoicedAmount)}</td>
                <td>{formatDZD(row.returnAmount)}</td>
                <td>{formatDZD(row.netPurchases)}</td>
                <td>{formatDZD(row.paidAmount)}</td>
                <td>{formatDZD(row.outstandingAmount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="table-empty-cell">
                Aucune donnee fournisseur pour cette periode.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Achats par mois</h3>
      <p className="panel-note">
        Lignes affichees: {purchasesByMonth.items.length}/{purchasesByMonth.total} (page {purchasesByMonth.page}/{purchasesByMonth.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Periode</th>
            <th>Achats nets</th>
            <th>Decaissements fournisseurs</th>
          </tr>
        </thead>
        <tbody>
          {purchasesByMonth.items.length ? (
            purchasesByMonth.items.map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td>{formatDZD(row.netPurchases)}</td>
                <td>{formatDZD(row.supplierOutflow)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="table-empty-cell">
                Aucune donnee achats par mois.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Ventes par categorie</h3>
      <p className="panel-note">
        Lignes affichees: {salesByCategory.items.length}/{salesByCategory.total} (page {salesByCategory.page}/{salesByCategory.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Categorie</th>
            <th>Ventes</th>
            <th>Qte</th>
            <th>Lignes</th>
          </tr>
        </thead>
        <tbody>
          {salesByCategory.items.length ? (
            salesByCategory.items.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td>{formatDZD(row.salesAmount)}</td>
                <td>{row.qty}</td>
                <td>{row.lineCount}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="table-empty-cell">
                Aucune donnee ventes par categorie.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Ventes par vendeur</h3>
      <p className="panel-note">
        Lignes affichees: {salesBySeller.items.length}/{salesBySeller.total} (page {salesBySeller.page}/{salesBySeller.totalPages})
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Vendeur</th>
            <th>Ventes</th>
            <th>Commandes</th>
            <th>Livrees</th>
            <th>Ticket moyen</th>
          </tr>
        </thead>
        <tbody>
          {salesBySeller.items.length ? (
            salesBySeller.items.map((row) => (
              <tr key={row.userId}>
                <td>{row.displayName}</td>
                <td>{formatDZD(row.salesAmount)}</td>
                <td>{row.orderCount}</td>
                <td>{row.deliveredOrderCount}</td>
                <td>{formatDZD(row.averageTicket)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucune donnee ventes par vendeur.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
