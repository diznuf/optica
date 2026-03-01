import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { StockCreateModals } from "@/components/stock-create-modals";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 25;
const stockStateOptions = ["ALL", "OK", "ALERTE", "RUPTURE"] as const;

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

function formatQty(value: number) {
  return Number(value.toFixed(2));
}

export default async function StockPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const selectedCategoryId = readParam(params.categoryId);
  const rawState = readParam(params.state);
  const selectedState = stockStateOptions.includes(rawState as (typeof stockStateOptions)[number])
    ? (rawState as (typeof stockStateOptions)[number])
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

  const baseWhere: Prisma.ProductWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const [products, categories, suppliers, stockInputProducts] = await Promise.all([
    db.product.findMany({
      where: baseWhere,
      include: { stockLots: true, category: true },
      orderBy: { name: "asc" }
    }),
    db.productCategory.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } })
  ]);

  const computedRows = products.map((product) => {
    const qty = formatQty(product.stockLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0));
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category.name,
      qty,
      reorderLevel: product.reorderLevel,
      status: qty <= 0 ? "Rupture" : qty <= product.reorderLevel ? "Alerte" : "OK"
    };
  });

  const filteredRows = computedRows.filter((row) => {
    if (selectedState === "ALL") {
      return true;
    }
    if (selectedState === "OK") {
      return row.status === "OK";
    }
    if (selectedState === "ALERTE") {
      return row.status === "Alerte";
    }
    return row.status === "Rupture";
  });

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalQty = formatQty(filteredRows.reduce((sum, row) => sum + row.qty, 0));
  const lowStockCount = filteredRows.filter((row) => row.qty <= row.reorderLevel).length;
  const outOfStockCount = filteredRows.filter((row) => row.qty <= 0).length;

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedCategoryId) {
      next.set("categoryId", selectedCategoryId);
    }
    if (selectedState !== "ALL") {
      next.set("state", selectedState);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/stock?${query}` : "/stock";
  }

  return (
    <AppShell session={session} title="Stock">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Produits actifs</div>
          <strong className="metric-value">{totalCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Quantite totale</div>
          <strong className="metric-value">{totalQty}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Alertes / Ruptures</div>
          <strong className="metric-value">
            {lowStockCount} / {outOfStockCount}
          </strong>
        </article>
      </section>

      <div className="page-actions">
        <Link href="/stock/movements" className="btn">
          Mouvements
        </Link>
        <Link href="/stock/alerts" className="btn">
          Alertes stock bas
        </Link>
        {["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role) ? (
          <StockCreateModals categories={categories} suppliers={suppliers} stockInputProducts={stockInputProducts} />
        ) : null}
      </div>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="SKU ou produit" />
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
          Etat
          <select className="input" name="state" defaultValue={selectedState}>
            <option value="ALL">Tous</option>
            <option value="OK">OK</option>
            <option value="ALERTE">Alerte</option>
            <option value="RUPTURE">Rupture</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/stock" className="btn">
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

      <table className="table stock-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Produit</th>
            <th>Categorie</th>
            <th>Qte</th>
            <th>Seuil</th>
            <th>Etat</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length ? (
            pageRows.map((row) => {
              return (
                <tr key={row.id}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td>{row.qty}</td>
                  <td>{row.reorderLevel}</td>
                  <td>
                    <span
                      className={`badge stock-state-badge ${
                        row.status === "Rupture" ? "danger" : row.status === "Alerte" ? "warn" : "ok"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="table-empty-cell">
                Aucun produit sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
