import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import { bucketFromDaysOverdue, summarizeAgingBalances, type AgingBucket } from "@/lib/services/supplier-debt";

const PAGE_SIZE = 30;

function readParam(input: string | string[] | undefined) {
  if (!input) {
    return "";
  }
  return Array.isArray(input) ? input[0] ?? "" : input;
}

function parsePage(input: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export default async function SupplierAgingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();

  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Echeances Fournisseurs">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const qValue = readParam(params.q).trim();
  const q = qValue.toLowerCase();
  const requestedPage = parsePage(readParam(params.page));
  const selectedBucket = readParam(params.bucket);

  const invoices = await db.supplierInvoice.findMany({
    where: { balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
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
    const bucketMatch = selectedBucket && selectedBucket !== "ALL" ? row.bucket === selectedBucket : true;
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
      supplierId: string;
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

  const supplierSummary = Array.from(supplierSummaryMap.values()).sort((a, b) => b.totalBalance - a.totalBalance);
  const totalCount = filteredDetails.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pagedDetails = filteredDetails.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const exportParams = new URLSearchParams();
  if (qValue) {
    exportParams.set("q", qValue);
  }
  if (selectedBucket && selectedBucket !== "ALL") {
    exportParams.set("bucket", selectedBucket);
  }
  const exportQuery = exportParams.toString();
  const exportHref = exportQuery ? `/api/reports/supplier-aging/export?${exportQuery}` : "/api/reports/supplier-aging/export";

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (qValue) {
      next.set("q", qValue);
    }
    if (selectedBucket && selectedBucket !== "ALL") {
      next.set("bucket", selectedBucket);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/reports/supplier-aging?${query}` : "/reports/supplier-aging";
  }

  return (
    <AppShell session={session} title="Echeances Fournisseurs">
      <p>
        Solde global ouvert: <strong>{formatDZD(summary.total)}</strong> (0-30: {formatDZD(summary["0-30"])}, 31-60:{" "}
        {formatDZD(summary["31-60"])}, 61+: {formatDZD(summary["61+"])}).
      </p>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={qValue} placeholder="Fournisseur ou facture" />
        </label>
        <label>
          Bucket
          <select className="input" name="bucket" defaultValue={selectedBucket || "ALL"}>
            <option value="ALL">Tous</option>
            <option value="0-30">0-30</option>
            <option value="31-60">31-60</option>
            <option value="61+">61+</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/reports/supplier-aging" className="btn">
          Reinitialiser
        </Link>
        <Link href={exportHref} className="btn">
          Exporter Excel
        </Link>
      </form>

      <div className="table-toolbar">
        <div className="table-meta">
          Factures: {totalCount} - Page {currentPage}/{totalPages}
        </div>
        <div className="pagination-controls">
          {currentPage > 1 ? (
            <Link href={buildHref(currentPage - 1)} className="btn">
              Precedent
            </Link>
          ) : (
            <span className="btn btn-disabled">Precedent</span>
          )}
          {currentPage < totalPages ? (
            <Link href={buildHref(currentPage + 1)} className="btn">
              Suivant
            </Link>
          ) : (
            <span className="btn btn-disabled">Suivant</span>
          )}
        </div>
      </div>

      <h3>Par fournisseur</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Factures</th>
            <th>0-30</th>
            <th>31-60</th>
            <th>61+</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {supplierSummary.length ? (
            supplierSummary.map((row) => (
              <tr key={row.supplierId}>
                <td>{row.supplierName}</td>
                <td>{row.invoiceCount}</td>
                <td>{formatDZD(row["0-30"])}</td>
                <td>{formatDZD(row["31-60"])}</td>
                <td>{formatDZD(row["61+"])}</td>
                <td>{formatDZD(row.totalBalance)}</td>
                <td>
                  <Link href={`/suppliers/${row.supplierId}`}>Ouvrir</Link>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="table-empty-cell">
                Aucun fournisseur pour ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Par facture</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Facture</th>
            <th>Echeance</th>
            <th>Jours retard</th>
            <th>Bucket</th>
            <th>Solde</th>
          </tr>
        </thead>
        <tbody>
          {pagedDetails.length ? (
            pagedDetails.map((row) => (
              <tr key={row.invoiceId}>
                <td>{row.supplierName}</td>
                <td>
                  <Link href={`/suppliers/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                </td>
                <td>{row.dueDate.toISOString().slice(0, 10)}</td>
                <td>{row.daysOverdue}</td>
                <td>{row.bucket}</td>
                <td>{formatDZD(row.balance)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="table-empty-cell">
                Aucune facture ouverte pour ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
