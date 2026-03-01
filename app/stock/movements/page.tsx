import Link from "next/link";
import { Prisma, StockMovementType } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { StockMovementForm } from "@/components/stock-movement-form";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 30;
const typeOptions: Array<StockMovementType> = ["IN", "OUT", "ADJUST", "RETURN_SUPPLIER"];

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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function mergeWhere(
  base: Prisma.StockMovementWhereInput | undefined,
  extra: Prisma.StockMovementWhereInput
): Prisma.StockMovementWhereInput {
  if (!base) {
    return extra;
  }
  return { AND: [base, extra] };
}

export default async function StockMovementsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const rawType = readParam(params.type);
  const selectedType = typeOptions.includes(rawType as StockMovementType)
    ? (rawType as StockMovementType)
    : "ALL";

  const clauses: Prisma.StockMovementWhereInput[] = [];
  if (selectedType !== "ALL") {
    clauses.push({ type: selectedType });
  }
  if (q) {
    clauses.push({
      product: {
        OR: [{ name: { contains: q } }, { sku: { contains: q } }]
      }
    });
  }
  const where: Prisma.StockMovementWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const totalCount = await db.stockMovement.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayWhere = mergeWhere(where, { createdAt: { gte: startOfDay } });

  const [movements, products, groupedCounts, todayCount] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: { product: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.product.findMany({ select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } }),
    db.stockMovement.groupBy({
      by: ["type"],
      where,
      _count: { _all: true }
    }),
    db.stockMovement.count({ where: todayWhere })
  ]);

  const movementCounts = groupedCounts.reduce<Record<string, number>>((acc, row) => {
    acc[row.type] = row._count._all;
    return acc;
  }, {});

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedType !== "ALL") {
      next.set("type", selectedType);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/stock/movements?${query}` : "/stock/movements";
  }

  return (
    <AppShell session={session} title="Mouvements de stock">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Mouvements filtres</div>
          <strong className="metric-value">{totalCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Aujourd'hui</div>
          <strong className="metric-value">{todayCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">IN / OUT / ADJUST</div>
          <strong className="metric-value">
            {movementCounts.IN ?? 0} / {movementCounts.OUT ?? 0} / {movementCounts.ADJUST ?? 0}
          </strong>
        </article>
      </section>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche produit
          <input className="input" name="q" defaultValue={q} placeholder="Nom ou SKU" />
        </label>
        <label>
          Type
          <select className="input" name="type" defaultValue={selectedType}>
            <option value="ALL">Tous</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/stock/movements" className="btn">
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

      {["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role) ? <StockMovementForm products={products} /> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Produit</th>
            <th>Type</th>
            <th>Qte</th>
            <th>Utilisateur</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((mv) => (
            <tr key={mv.id}>
              <td>{formatDate(mv.createdAt)}</td>
              <td>{mv.product.name}</td>
              <td>
                <span
                  className={`badge stock-state-badge ${
                    mv.type === "IN"
                      ? "ok"
                      : mv.type === "OUT"
                        ? "danger"
                        : mv.type === "ADJUST"
                          ? "warn"
                          : "warn"
                  }`}
                >
                  {mv.type}
                </span>
              </td>
              <td>{mv.qty}</td>
              <td>{mv.createdBy.displayName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
