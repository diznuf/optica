import Link from "next/link";
import { endOfDay, startOfDay } from "date-fns";
import { Prisma, OrderStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 20;
const statusOptions: Array<OrderStatus> = ["BROUILLON", "CONFIRMEE", "EN_ATELIER", "PRETE", "LIVREE", "ANNULEE"];

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

function parseDateInput(input: string) {
  if (!input) {
    return null;
  }
  const parsed = new Date(`${input}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function mergeWhere(base: Prisma.OrderWhereInput | undefined, extra: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
  if (!base) {
    return extra;
  }
  return { AND: [base, extra] };
}

function orderStatusClass(status: OrderStatus) {
  switch (status) {
    case "BROUILLON":
      return "draft";
    case "CONFIRMEE":
      return "confirmed";
    case "EN_ATELIER":
      return "workshop";
    case "PRETE":
      return "ready";
    case "LIVREE":
      return "delivered";
    case "ANNULEE":
      return "cancelled";
    default:
      return "draft";
  }
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const rawStatus = readParam(params.status);
  const selectedStatus = statusOptions.includes(rawStatus as OrderStatus) ? (rawStatus as OrderStatus) : "ALL";
  const paymentState = readParam(params.payment) === "paid" ? "paid" : readParam(params.payment) === "open" ? "open" : "all";
  const fromDateInput = readParam(params.from).trim();
  const toDateInput = readParam(params.to).trim();
  const fromDate = parseDateInput(fromDateInput);
  const toDate = parseDateInput(toDateInput);

  const clauses: Prisma.OrderWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [
        { number: { contains: q } },
        { patient: { firstName: { contains: q } } },
        { patient: { lastName: { contains: q } } },
        { patient: { code: { contains: q } } },
        { patient: { phone: { contains: q } } }
      ]
    });
  }
  if (selectedStatus !== "ALL") {
    clauses.push({ status: selectedStatus });
  }
  if (paymentState === "open") {
    clauses.push({ balance: { gt: 0 } });
  } else if (paymentState === "paid") {
    clauses.push({ balance: { lte: 0 } });
  }
  if (fromDate) {
    clauses.push({ orderDate: { gte: startOfDay(fromDate) } });
  }
  if (toDate) {
    clauses.push({ orderDate: { lte: endOfDay(toDate) } });
  }
  const where: Prisma.OrderWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const totalCount = await db.order.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const [orders, openCount, readyCount] = await Promise.all([
    db.order.findMany({
      where,
      include: { patient: true },
      orderBy: { orderDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.order.count({ where: mergeWhere(where, { balance: { gt: 0 } }) }),
    db.order.count({ where: mergeWhere(where, { status: "PRETE" }) })
  ]);

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedStatus !== "ALL") {
      next.set("status", selectedStatus);
    }
    if (paymentState !== "all") {
      next.set("payment", paymentState);
    }
    if (fromDateInput) {
      next.set("from", fromDateInput);
    }
    if (toDateInput) {
      next.set("to", toDateInput);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/orders?${query}` : "/orders";
  }

  return (
    <AppShell session={session} title="Commandes patients">
      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Commandes filtrees</div>
          <strong className="metric-value">{totalCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Commandes pretes</div>
          <strong className="metric-value">{readyCount}</strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Commandes avec solde</div>
          <strong className="metric-value">{openCount}</strong>
        </article>
      </section>

      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Numero, patient, code, telephone" />
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={selectedStatus}>
            <option value="ALL">Tous</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Paiement
          <select className="input" name="payment" defaultValue={paymentState}>
            <option value="all">Tous</option>
            <option value="open">Avec solde</option>
            <option value="paid">Soldes</option>
          </select>
        </label>
        <label>
          Du
          <input className="input" type="date" name="from" defaultValue={fromDateInput} />
        </label>
        <label>
          Au
          <input className="input" type="date" name="to" defaultValue={toDateInput} />
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/orders" className="btn">
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

      <div className="page-actions">
        <Link href="/orders/new" className="btn btn-primary">
          Nouvelle commande
        </Link>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Numero</th>
            <th>Date</th>
            <th>Patient</th>
            <th>Statut</th>
            <th>Total</th>
            <th>Solde</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.length ? (
            orders.map((order) => (
              <tr key={order.id}>
                <td>{order.number}</td>
                <td>{order.orderDate.toISOString().slice(0, 10)}</td>
                <td>{order.patient.firstName + " " + order.patient.lastName}</td>
                <td>
                  <span className={`badge order-status-badge ${orderStatusClass(order.status)}`}>{order.status}</span>
                </td>
                <td>{formatDZD(order.totalAmount)}</td>
                <td>{formatDZD(order.balance)}</td>
                <td>
                  <Link href={`/orders/${order.id}`} className="table-link">
                    Voir
                  </Link>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="table-empty-cell">
                Aucune commande sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
