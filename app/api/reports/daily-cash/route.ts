import { endOfDay, startOfDay } from "date-fns";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requirePermission } from "@/lib/route-guard";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "reports", "read");
  if (auth.response) {
    return auth.response;
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const userIdParam = request.nextUrl.searchParams.get("userId");
  const baseDate = dateParam ? new Date(dateParam) : new Date();
  const from = startOfDay(baseDate);
  const to = endOfDay(baseDate);
  const userId = auth.session.role === "VENDEUR" ? auth.session.userId : userIdParam;

  const payments = await db.customerPayment.findMany({
    where: {
      ...(userId ? { createdById: userId } : {}),
      paidAt: {
        gte: from,
        lte: to
      }
    },
    include: {
      order: { select: { id: true, number: true } },
      createdBy: { select: { id: true, displayName: true } }
    },
    orderBy: { paidAt: "asc" }
  });

  const byMethod = payments.reduce(
    (acc, payment) => {
      acc[payment.method] += payment.amount;
      acc.total += payment.amount;
      return acc;
    },
    { CASH: 0, CARD: 0, TRANSFER: 0, total: 0 }
  );

  const bySellerMap = new Map<
    string,
    {
      userId: string;
      displayName: string;
      CASH: number;
      CARD: number;
      TRANSFER: number;
      total: number;
    }
  >();

  for (const payment of payments) {
    const key = payment.createdBy.id;
    const row = bySellerMap.get(key) ?? {
      userId: payment.createdBy.id,
      displayName: payment.createdBy.displayName,
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      total: 0
    };
    row[payment.method] += payment.amount;
    row.total += payment.amount;
    bySellerMap.set(key, row);
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

  const [openShift, shifts] = await Promise.all([
    db.cashShift.findFirst({
      where: {
        userId: auth.session.userId,
        status: "OPEN"
      },
      orderBy: { openedAt: "desc" }
    }),
    db.cashShift.findMany({
      where: {
        ...(auth.session.role === "VENDEUR" ? { userId: auth.session.userId } : {}),
        openedAt: { gte: from, lte: to }
      },
      include: {
        user: { select: { id: true, displayName: true, username: true } }
      },
      orderBy: { openedAt: "desc" },
      take: 100
    })
  ]);

  return ok({
    date: from,
    totals: {
      CASH: round2(byMethod.CASH),
      CARD: round2(byMethod.CARD),
      TRANSFER: round2(byMethod.TRANSFER),
      total: round2(byMethod.total)
    },
    bySeller,
    openShift,
    shifts,
    payments
  });
}
