import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { SupplierCreateModal } from "@/components/supplier-create-modal";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";
import { summarizeSupplierDebt } from "@/lib/services/supplier-debt";

const PAGE_SIZE = 20;
const debtFilterOptions = ["all", "open", "overdue", "settled"] as const;

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

export default async function SuppliersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role)) {
    return (
      <AppShell session={session} title="Fournisseurs">
        <p>Acces refuse pour ce role.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const activeFilter = readParam(params.active);
  const rawDebtFilter = readParam(params.debt);
  const debtFilter = debtFilterOptions.includes(rawDebtFilter as (typeof debtFilterOptions)[number])
    ? (rawDebtFilter as (typeof debtFilterOptions)[number])
    : "all";

  const clauses: Prisma.SupplierWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [{ code: { contains: q } }, { name: { contains: q } }, { phone: { contains: q } }]
    });
  }
  if (activeFilter === "1") {
    clauses.push({ isActive: true });
  } else if (activeFilter === "0") {
    clauses.push({ isActive: false });
  }
  const where: Prisma.SupplierWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const suppliers = await db.supplier.findMany({
    where,
    include: {
      supplierInvoices: {
        select: {
          totalAmount: true,
          paidAmount: true,
          balance: true,
          dueDate: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const supplierRows = suppliers
    .map((supplier) => ({
      supplier,
      debt: summarizeSupplierDebt(supplier.openingBalance, supplier.supplierInvoices)
    }))
    .filter((row) => {
      if (debtFilter === "open") {
        return row.debt.outstanding > 0;
      }
      if (debtFilter === "overdue") {
        return row.debt.overdueOutstanding > 0;
      }
      if (debtFilter === "settled") {
        return row.debt.outstanding <= 0;
      }
      return true;
    });

  const global = supplierRows.reduce(
    (acc, row) => {
      acc.outstanding += row.debt.outstanding;
      acc.overdue += row.debt.overdueOutstanding;
      return acc;
    },
    { outstanding: 0, overdue: 0 }
  );

  const totalCount = supplierRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pagedRows = supplierRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (activeFilter) {
      next.set("active", activeFilter);
    }
    if (debtFilter !== "all") {
      next.set("debt", debtFilter);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/suppliers?${query}` : "/suppliers";
  }

  return (
    <AppShell session={session} title="Fournisseurs">
      <div className="page-actions">
        <SupplierCreateModal />
        <Link href="/suppliers/purchase-orders" className="btn">
          Bons de commande
        </Link>
        <Link href="/suppliers/invoices" className="btn">
          Factures fournisseurs
        </Link>
      </div>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Code, nom, telephone" />
        </label>
        <label>
          Actif
          <select className="input" name="active" defaultValue={activeFilter}>
            <option value="">Tous</option>
            <option value="1">Actifs</option>
            <option value="0">Inactifs</option>
          </select>
        </label>
        <label>
          Solde
          <select className="input" name="debt" defaultValue={debtFilter}>
            <option value="all">Tous</option>
            <option value="open">Avec dette</option>
            <option value="overdue">Dette echue</option>
            <option value="settled">Soldes</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/suppliers" className="btn">
          Reinitialiser
        </Link>
      </form>

      <div className="table-toolbar">
        <div className="table-meta">
          Total: {totalCount} - Page {currentPage}/{totalPages}
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

      <p>
        Solde global fournisseurs: <strong>{formatDZD(global.outstanding)}</strong> | Echu: <strong>{formatDZD(global.overdue)}</strong>
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Nom</th>
            <th>Telephone</th>
            {session.role !== "VENDEUR" ? <th>Paye</th> : null}
            {session.role !== "VENDEUR" ? <th>Solde</th> : null}
            {session.role !== "VENDEUR" ? <th>Echu</th> : null}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedRows.length ? (
            pagedRows.map(({ supplier, debt }) => {
              return (
                <tr key={supplier.id}>
                  <td>{supplier.code}</td>
                  <td>{supplier.name}</td>
                  <td>{supplier.phone ?? "-"}</td>
                  {session.role !== "VENDEUR" ? <td>{formatDZD(debt.paidAmount)}</td> : null}
                  {session.role !== "VENDEUR" ? <td>{formatDZD(debt.outstanding)}</td> : null}
                  {session.role !== "VENDEUR" ? <td>{formatDZD(debt.overdueOutstanding)}</td> : null}
                  <td>
                    <Link href={`/suppliers/${supplier.id}`}>Voir</Link>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={session.role !== "VENDEUR" ? 7 : 4} className="table-empty-cell">
                Aucun fournisseur sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
