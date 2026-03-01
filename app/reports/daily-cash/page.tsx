import { startOfDay, endOfDay } from "date-fns";
import Link from "next/link";
import { PaymentMethod } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CashShiftActions } from "@/components/cash-shift-actions";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 40;
const methodOptions: Array<PaymentMethod> = ["CASH", "CARD", "TRANSFER"];

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

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

export default async function DailyCashPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const selectedDate = parseDateInput(readParam(params.date));
  const selectedDateValue = formatDateInput(selectedDate);
  const requestedPage = parsePage(readParam(params.page));
  const rawMethod = readParam(params.method);
  const selectedMethod = methodOptions.includes(rawMethod as PaymentMethod) ? (rawMethod as PaymentMethod) : "ALL";
  const selectedUserId = session.role === "VENDEUR" ? session.userId : readParam(params.userId);

  const from = startOfDay(selectedDate);
  const to = endOfDay(selectedDate);

  const paymentWhere: {
    paidAt: { gte: Date; lte: Date };
    createdById?: string;
    method?: PaymentMethod;
  } = {
    paidAt: { gte: from, lte: to }
  };
  if (session.role === "VENDEUR") {
    paymentWhere.createdById = session.userId;
  } else if (selectedUserId) {
    paymentWhere.createdById = selectedUserId;
  }
  if (selectedMethod !== "ALL") {
    paymentWhere.method = selectedMethod;
  }

  const paymentsForDay = await db.customerPayment.findMany({
    where: paymentWhere,
    include: { order: true, createdBy: true },
    orderBy: { paidAt: "desc" }
  });

  const totalCount = paymentsForDay.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const payments = paymentsForDay.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totals = paymentsForDay.reduce(
    (acc, payment) => {
      acc[payment.method] += payment.amount;
      acc.total += payment.amount;
      return acc;
    },
    { CASH: 0, CARD: 0, TRANSFER: 0, total: 0 }
  );

  const bySeller = paymentsForDay.reduce<Record<string, { displayName: string; CASH: number; CARD: number; TRANSFER: number; total: number }>>(
    (acc, payment) => {
      const key = payment.createdById;
      if (!acc[key]) {
        acc[key] = { displayName: payment.createdBy.displayName, CASH: 0, CARD: 0, TRANSFER: 0, total: 0 };
      }
      acc[key][payment.method] += payment.amount;
      acc[key].total += payment.amount;
      return acc;
    },
    {}
  );

  const isToday = selectedDateValue === formatDateInput(new Date());

  const openShift =
    isToday && (session.role === "VENDEUR" || session.role === "ADMIN")
      ? await db.cashShift.findFirst({
          where: { userId: session.userId, status: "OPEN" },
          orderBy: { openedAt: "desc" }
        })
      : null;

  const openShiftCashCollected = openShift
    ? (
        await db.customerPayment.aggregate({
          where: {
            createdById: session.userId,
            method: "CASH",
            paidAt: { gte: openShift.openedAt, lte: new Date() }
          },
          _sum: { amount: true }
        })
      )._sum.amount ?? 0
    : 0;

  const openShiftInfo = openShift
    ? {
        id: openShift.id,
        openedAt: openShift.openedAt.toISOString().slice(0, 16).replace("T", " "),
        openingCash: openShift.openingCash,
        cashCollected: Number(openShiftCashCollected.toFixed(2)),
        expectedCash: Number((openShift.openingCash + openShiftCashCollected).toFixed(2))
      }
    : null;

  const shifts = await db.cashShift.findMany({
    where: {
      openedAt: { gte: from, lte: to },
      ...(session.role === "VENDEUR" ? { userId: session.userId } : {})
    },
    include: {
      user: { select: { displayName: true } }
    },
    orderBy: { openedAt: "desc" },
    take: 100
  });

  const userOptions =
    session.role === "VENDEUR"
      ? []
      : await db.user.findMany({
          where: { isActive: true },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" }
        });
  const exportParams = new URLSearchParams();
  exportParams.set("date", selectedDateValue);
  if (selectedMethod !== "ALL") {
    exportParams.set("method", selectedMethod);
  }
  if (session.role !== "VENDEUR" && selectedUserId) {
    exportParams.set("userId", selectedUserId);
  }
  const exportHref = `/api/reports/daily-cash/export?${exportParams.toString()}`;

  function buildHref(page: number) {
    const next = new URLSearchParams();
    next.set("date", selectedDateValue);
    if (selectedMethod !== "ALL") {
      next.set("method", selectedMethod);
    }
    if (session.role !== "VENDEUR" && selectedUserId) {
      next.set("userId", selectedUserId);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/reports/daily-cash?${query}` : "/reports/daily-cash";
  }

  return (
    <AppShell session={session} title="Caisse journaliere">
      <form className="page-filter-form" method="GET">
        <label>
          Date
          <input className="input" type="date" name="date" defaultValue={selectedDateValue} />
        </label>
        <label>
          Methode
          <select className="input" name="method" defaultValue={selectedMethod}>
            <option value="ALL">Toutes</option>
            {methodOptions.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        {session.role !== "VENDEUR" ? (
          <label>
            Utilisateur
            <select className="input" name="userId" defaultValue={selectedUserId}>
              <option value="">Tous</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/reports/daily-cash" className="btn">
          Reinitialiser
        </Link>
        <Link href={exportHref} className="btn">
          Exporter Excel
        </Link>
      </form>

      <CashShiftActions openShift={openShiftInfo} canManage={["VENDEUR", "ADMIN"].includes(session.role) && isToday} />

      <p>
        Cash: {formatDZD(totals.CASH)} | Carte: {formatDZD(totals.CARD)} | Virement: {formatDZD(totals.TRANSFER)} | Total: {formatDZD(totals.total)}
      </p>

      {session.role !== "VENDEUR" ? (
        <>
          <h3>Totaux par vendeur</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Vendeur</th>
                <th>Cash</th>
                <th>Carte</th>
                <th>Virement</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySeller).length ? (
                Object.entries(bySeller).map(([userId, row]) => (
                  <tr key={userId}>
                    <td>{row.displayName}</td>
                    <td>{formatDZD(row.CASH)}</td>
                    <td>{formatDZD(row.CARD)}</td>
                    <td>{formatDZD(row.TRANSFER)}</td>
                    <td>{formatDZD(row.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    Aucun paiement pour cette date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      ) : null}

      <h3>Shifts de la date</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Ouverture</th>
            <th>Cloture</th>
            <th>Fond</th>
            <th>Attendu</th>
            <th>Declare</th>
            <th>Ecart</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {shifts.length ? (
            shifts.map((shift) => (
              <tr key={shift.id}>
                <td>{shift.user.displayName}</td>
                <td>{shift.openedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{shift.closedAt ? shift.closedAt.toISOString().slice(0, 16).replace("T", " ") : "-"}</td>
                <td>{formatDZD(shift.openingCash)}</td>
                <td>{shift.expectedCash === null ? "-" : formatDZD(shift.expectedCash)}</td>
                <td>{shift.closingCashDeclared === null ? "-" : formatDZD(shift.closingCashDeclared)}</td>
                <td>{shift.variance === null ? "-" : formatDZD(shift.variance)}</td>
                <td>{shift.status}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="table-empty-cell">
                Aucun shift sur cette date.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="table-toolbar">
        <div className="table-meta">
          Paiements: {totalCount} - Page {currentPage}/{totalPages}
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
            <th>Heure</th>
            <th>Commande</th>
            <th>Mode</th>
            <th>Montant</th>
            <th>Utilisateur</th>
          </tr>
        </thead>
        <tbody>
          {payments.length ? (
            payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paidAt.toISOString().slice(11, 16)}</td>
                <td>{payment.order.number}</td>
                <td>{payment.method}</td>
                <td>{formatDZD(payment.amount)}</td>
                <td>{payment.createdBy.displayName}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="table-empty-cell">
                Aucun paiement pour cette date.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
