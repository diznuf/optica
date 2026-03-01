import { endOfDay, startOfDay } from "date-fns";
import { PaymentMethod } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildExcelResponse, type ExcelTable } from "@/lib/excel-export";
import { requirePermission } from "@/lib/route-guard";

const methodOptions: PaymentMethod[] = ["CASH", "CARD", "TRANSFER"];

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string | null): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  const selectedDate = parseDateInput(request.nextUrl.searchParams.get("date"));
  const selectedDateValue = toDateInput(selectedDate);
  const rawMethod = (request.nextUrl.searchParams.get("method") ?? "").toUpperCase();
  const selectedMethod = methodOptions.includes(rawMethod as PaymentMethod) ? (rawMethod as PaymentMethod) : "ALL";
  const selectedUserId = auth.session.role === "VENDEUR" ? auth.session.userId : request.nextUrl.searchParams.get("userId");

  const from = startOfDay(selectedDate);
  const to = endOfDay(selectedDate);

  const paymentWhere: {
    paidAt: { gte: Date; lte: Date };
    createdById?: string;
    method?: PaymentMethod;
  } = {
    paidAt: { gte: from, lte: to }
  };
  if (selectedUserId) {
    paymentWhere.createdById = selectedUserId;
  }
  if (selectedMethod !== "ALL") {
    paymentWhere.method = selectedMethod;
  }

  const [payments, shifts, filteredUser] = await Promise.all([
    db.customerPayment.findMany({
      where: paymentWhere,
      include: {
        order: { select: { number: true } },
        createdBy: { select: { id: true, displayName: true } }
      },
      orderBy: { paidAt: "desc" }
    }),
    db.cashShift.findMany({
      where: {
        openedAt: { gte: from, lte: to },
        ...(auth.session.role === "VENDEUR" ? { userId: auth.session.userId } : {})
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: { openedAt: "desc" },
      take: 100
    }),
    selectedUserId
      ? db.user.findUnique({
          where: { id: selectedUserId },
          select: { displayName: true }
        })
      : Promise.resolve(null)
  ]);

  const totals = payments.reduce(
    (acc, payment) => {
      acc[payment.method] += payment.amount;
      acc.total += payment.amount;
      return acc;
    },
    { CASH: 0, CARD: 0, TRANSFER: 0, total: 0 }
  );

  const bySellerMap = new Map<string, { displayName: string; CASH: number; CARD: number; TRANSFER: number; total: number }>();
  for (const payment of payments) {
    const current = bySellerMap.get(payment.createdBy.id) ?? {
      displayName: payment.createdBy.displayName,
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      total: 0
    };
    current[payment.method] += payment.amount;
    current.total += payment.amount;
    bySellerMap.set(payment.createdBy.id, current);
  }

  const bySeller = Array.from(bySellerMap.values())
    .map((row) => ({
      ...row,
      CASH: round2(row.CASH),
      CARD: round2(row.CARD),
      TRANSFER: round2(row.TRANSFER),
      total: round2(row.total)
    }))
    .sort((a, b) => b.total - a.total);

  const tables: ExcelTable[] = [
    {
      title: "Totaux",
      columns: ["Methode", "Montant (DZD)"],
      rows: [
        ["CASH", round2(totals.CASH)],
        ["CARD", round2(totals.CARD)],
        ["TRANSFER", round2(totals.TRANSFER)],
        ["TOTAL", round2(totals.total)]
      ]
    },
    {
      title: "Totaux par vendeur",
      columns: ["Vendeur", "Cash (DZD)", "Carte (DZD)", "Virement (DZD)", "Total (DZD)"],
      rows: bySeller.map((row) => [row.displayName, row.CASH, row.CARD, row.TRANSFER, row.total])
    },
    {
      title: "Shifts de la date",
      columns: ["Vendeur", "Ouverture", "Cloture", "Fond (DZD)", "Attendu (DZD)", "Declare (DZD)", "Ecart (DZD)", "Statut"],
      rows: shifts.map((shift) => [
        shift.user.displayName,
        shift.openedAt,
        shift.closedAt ?? "",
        shift.openingCash,
        shift.expectedCash ?? "",
        shift.closingCashDeclared ?? "",
        shift.variance ?? "",
        shift.status
      ])
    },
    {
      title: "Paiements",
      columns: ["Date heure", "Commande", "Methode", "Montant (DZD)", "Utilisateur"],
      rows: payments.map((payment) => [payment.paidAt, payment.order.number, payment.method, payment.amount, payment.createdBy.displayName])
    }
  ];

  return buildExcelResponse(`caisse-journaliere-${selectedDateValue}`, {
    title: "Caisse journaliere",
    subtitle: "Export Excel",
    meta: [
      { label: "Date", value: selectedDateValue },
      { label: "Methode", value: selectedMethod },
      { label: "Utilisateur", value: filteredUser?.displayName ?? (selectedUserId ? selectedUserId : "Tous") },
      { label: "Role export", value: auth.session.role }
    ],
    tables
  });
}
