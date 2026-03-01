import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 25;
const severityOptions = ["ALL", "ALERTE", "RUPTURE"] as const;

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

export default async function StockAlertsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const selectedCategoryId = readParam(params.categoryId);
  const rawSeverity = readParam(params.severity);
  const selectedSeverity = severityOptions.includes(rawSeverity as (typeof severityOptions)[number])
    ? (rawSeverity as (typeof severityOptions)[number])
    : "ALL";

  const clauses: Prisma.ProductWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [{ name: { contains: q } }, { sku: { contains: q } }]
    });
  }
  if (selectedCategoryId) {
    clauses.push({ categoryId: selectedCategoryId });
  }

  const where: Prisma.ProductWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const [products, categories] = await Promise.all([
    db.product.findMany({ where, include: { stockLots: true, category: true }, orderBy: { name: "asc" } }),
    db.productCategory.findMany({ orderBy: { name: "asc" } })
  ]);

  const alerts = products
    .map((product) => ({
      ...product,
      currentQty: product.stockLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0)
    }))
    .filter((product) => product.currentQty <= product.reorderLevel)
    .sort((a, b) => a.currentQty - b.currentQty);

  const filteredAlerts = alerts.filter((item) => {
    if (selectedSeverity === "ALL") {
      return true;
    }
    if (selectedSeverity === "RUPTURE") {
      return item.currentQty <= 0;
    }
    return item.currentQty > 0;
  });

  const totalCount = filteredAlerts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageAlerts = filteredAlerts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const critical = filteredAlerts.filter((item) => item.currentQty <= 0).length;

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedCategoryId) {
      next.set("categoryId", selectedCategoryId);
    }
    if (selectedSeverity !== "ALL") {
      next.set("severity", selectedSeverity);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/stock/alerts?${query}` : "/stock/alerts";
  }

  return (
    <AppShell session={session} title="Alertes stock bas">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Produits en alerte</div>
          <strong className="metric-value">{totalCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Ruptures critiques</div>
          <strong className="metric-value">{critical}</strong>
        </article>
      </section>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Produit ou SKU" />
        </label>
        <label>
          Categorie
          <select className="input" name="categoryId" defaultValue={selectedCategoryId}>
            <option value="">Toutes</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Niveau
          <select className="input" name="severity" defaultValue={selectedSeverity}>
            <option value="ALL">Tous</option>
            <option value="ALERTE">Alerte</option>
            <option value="RUPTURE">Rupture</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/stock/alerts" className="btn">
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

      <table className="table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Categorie</th>
            <th>Qte actuelle</th>
            <th>Seuil</th>
            <th>Etat</th>
          </tr>
        </thead>
        <tbody>
          {pageAlerts.length ? (
            pageAlerts.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category.name}</td>
                <td>{item.currentQty}</td>
                <td>{item.reorderLevel}</td>
                <td>
                  <span className={`badge stock-state-badge ${item.currentQty <= 0 ? "danger" : "warn"}`}>
                    {item.currentQty <= 0 ? "Rupture" : "Alerte"}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucun produit en alerte pour ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
