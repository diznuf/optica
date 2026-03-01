import { differenceInCalendarDays } from "date-fns";

export type AgingBucket = "0-30" | "31-60" | "61+";

export type SupplierDebtInvoiceInput = {
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: Date;
  status: "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
};

export type AgingSummary = {
  "0-30": number;
  "31-60": number;
  "61+": number;
  total: number;
};

export type SupplierDebtSummary = {
  openingBalance: number;
  invoicedAmount: number;
  paidAmount: number;
  outstanding: number;
  overdueOutstanding: number;
  aging: AgingSummary;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function bucketFromDaysOverdue(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30) {
    return "0-30";
  }
  if (daysOverdue <= 60) {
    return "31-60";
  }
  return "61+";
}

export function summarizeAgingBalances(
  rows: Array<{ dueDate: Date; balance: number }>,
  referenceDate: Date = new Date()
): AgingSummary {
  const summary: AgingSummary = { "0-30": 0, "31-60": 0, "61+": 0, total: 0 };

  for (const row of rows) {
    if (row.balance <= 0) {
      continue;
    }
    const daysOverdue = Math.max(0, differenceInCalendarDays(referenceDate, row.dueDate));
    const bucket = bucketFromDaysOverdue(daysOverdue);
    summary[bucket] += row.balance;
    summary.total += row.balance;
  }

  return {
    "0-30": round2(summary["0-30"]),
    "31-60": round2(summary["31-60"]),
    "61+": round2(summary["61+"]),
    total: round2(summary.total)
  };
}

export function summarizeSupplierDebt(
  openingBalance: number,
  invoices: SupplierDebtInvoiceInput[],
  referenceDate: Date = new Date()
): SupplierDebtSummary {
  const activeInvoices = invoices.filter((invoice) => invoice.status !== "CANCELLED");

  const invoicedAmount = activeInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, openingBalance);
  const paidAmount = activeInvoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0);
  const outstanding = activeInvoices.reduce((sum, invoice) => sum + invoice.balance, openingBalance);
  const overdueOutstanding = activeInvoices.reduce((sum, invoice) => {
    if (invoice.balance <= 0) {
      return sum;
    }
    const daysOverdue = differenceInCalendarDays(referenceDate, invoice.dueDate);
    return daysOverdue > 0 ? sum + invoice.balance : sum;
  }, 0);

  const aging = summarizeAgingBalances(
    activeInvoices.map((invoice) => ({ dueDate: invoice.dueDate, balance: invoice.balance })),
    referenceDate
  );

  return {
    openingBalance: round2(openingBalance),
    invoicedAmount: round2(invoicedAmount),
    paidAmount: round2(paidAmount),
    outstanding: round2(outstanding),
    overdueOutstanding: round2(overdueOutstanding),
    aging
  };
}
