import { differenceInCalendarDays, endOfDay, endOfMonth, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";

const SALES_ORDER_STATUSES = ["CONFIRMEE", "EN_ATELIER", "PRETE", "LIVREE"] as const;
const DELIVERED_STATUS = "LIVREE";
const ADMIN_ONLY_MESSAGE = "Acces reserve a l'administrateur";
const SERVICE_CATEGORY_LABEL = "Service / Hors produit";
const ACCOUNTING_MAX_RANGE_DAYS = 366;
const ACCOUNTING_DEFAULT_PAGE_SIZE = 40;
const ACCOUNTING_MAX_PAGE_SIZE = 200;

export type AccountingGroupBy = "day" | "week" | "month";

export type AccountingRange = {
  from: Date;
  to: Date;
};

type RangeInput = {
  from?: string | null;
  to?: string | null;
};

type RangeOptions = {
  maxDays?: number;
};

type PaginationInput = {
  page?: string | null;
  pageSize?: string | null;
};

type PaginationOptions = {
  defaultPageSize?: number;
  maxPageSize?: number;
};

export type AccountingPagination = {
  page: number;
  pageSize: number;
  offset: number;
};

export type PaginatedRows<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type BucketRow = {
  period: string;
  periodStart: string;
  periodEnd: string;
  salesAmount: number;
  purchasesAmount: number;
  customerInflow: number;
  supplierOutflow: number;
  netCashflow: number;
  orderCount: number;
  deliveredOrderCount: number;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseOptionalDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function parsePositiveInteger(raw: string | null | undefined): number | null {
  if (!raw?.trim()) {
    return null;
  }
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAccountingRange(input: RangeInput, options?: RangeOptions): { range: AccountingRange | null; error: string | null } {
  const now = new Date();
  const parsedTo = parseOptionalDate(input.to);
  if (input.to && !parsedTo) {
    return { range: null, error: "Parametre 'to' invalide" };
  }

  const parsedFrom = parseOptionalDate(input.from);
  if (input.from && !parsedFrom) {
    return { range: null, error: "Parametre 'from' invalide" };
  }

  const baseTo = parsedTo ?? now;
  const from = startOfDay(parsedFrom ?? startOfMonth(baseTo));
  const to = endOfDay(baseTo);

  if (from.getTime() > to.getTime()) {
    return { range: null, error: "Parametres invalides: 'from' doit etre <= 'to'" };
  }

  const maxDays = options?.maxDays ?? null;
  if (maxDays && maxDays > 0) {
    const spanDays = differenceInCalendarDays(to, from) + 1;
    if (spanDays > maxDays) {
      return { range: null, error: `Plage date trop large (max ${maxDays} jours)` };
    }
  }

  return { range: { from, to }, error: null };
}

export function parseAccountingGroupBy(
  raw: string | null | undefined
): { groupBy: AccountingGroupBy | null; error: string | null } {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return { groupBy: "day", error: null };
  }
  if (normalized === "day" || normalized === "week" || normalized === "month") {
    return { groupBy: normalized, error: null };
  }
  return { groupBy: null, error: "Parametre 'groupBy' invalide (day|week|month)" };
}

export function parseAccountingPagination(
  input: PaginationInput,
  options?: PaginationOptions
): { pagination: AccountingPagination | null; error: string | null } {
  const defaultPageSize = options?.defaultPageSize ?? ACCOUNTING_DEFAULT_PAGE_SIZE;
  const maxPageSize = options?.maxPageSize ?? ACCOUNTING_MAX_PAGE_SIZE;
  const pageRaw = input.page?.trim() ?? "";
  const pageSizeRaw = input.pageSize?.trim() ?? "";

  let page = 1;
  if (pageRaw) {
    const parsed = parsePositiveInteger(pageRaw);
    if (!parsed) {
      return { pagination: null, error: "Parametre 'page' invalide" };
    }
    page = parsed;
  }

  let pageSize = defaultPageSize;
  if (pageSizeRaw) {
    const parsed = parsePositiveInteger(pageSizeRaw);
    if (!parsed) {
      return { pagination: null, error: "Parametre 'pageSize' invalide" };
    }
    pageSize = parsed;
  }

  if (pageSize > maxPageSize) {
    return { pagination: null, error: `Parametre 'pageSize' trop grand (max ${maxPageSize})` };
  }

  return {
    pagination: {
      page,
      pageSize,
      offset: (page - 1) * pageSize
    },
    error: null
  };
}

export function paginateRows<T>(rows: T[], pagination: AccountingPagination): PaginatedRows<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);
  const offset = (page - 1) * pagination.pageSize;
  const items = rows.slice(offset, offset + pagination.pageSize);
  return {
    items,
    total,
    page,
    pageSize: pagination.pageSize,
    totalPages
  };
}

function bucketStart(date: Date, groupBy: AccountingGroupBy) {
  if (groupBy === "day") {
    return startOfDay(date);
  }
  if (groupBy === "week") {
    return startOfWeek(date, { weekStartsOn: 1 });
  }
  return startOfMonth(date);
}

function bucketEnd(start: Date, groupBy: AccountingGroupBy) {
  if (groupBy === "day") {
    return endOfDay(start);
  }
  if (groupBy === "week") {
    return endOfDay(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000));
  }
  return endOfMonth(start);
}

function bucketKey(date: Date, groupBy: AccountingGroupBy) {
  const start = bucketStart(date, groupBy);
  if (groupBy === "day") {
    return format(start, "yyyy-MM-dd");
  }
  if (groupBy === "week") {
    return format(start, "RRRR-'W'II");
  }
  return format(start, "yyyy-MM");
}

function ensureBucket(map: Map<string, BucketRow>, date: Date, groupBy: AccountingGroupBy): BucketRow {
  const key = bucketKey(date, groupBy);
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const start = bucketStart(date, groupBy);
  const end = bucketEnd(start, groupBy);
  const row: BucketRow = {
    period: key,
    periodStart: toISODate(start),
    periodEnd: toISODate(end),
    salesAmount: 0,
    purchasesAmount: 0,
    customerInflow: 0,
    supplierOutflow: 0,
    netCashflow: 0,
    orderCount: 0,
    deliveredOrderCount: 0
  };
  map.set(key, row);
  return row;
}

async function deliveredOrderIds(range: AccountingRange): Promise<string[]> {
  const logs = await db.auditLog.findMany({
    where: {
      entity: "Order",
      action: "ORDER_STATUS_CHANGE",
      createdAt: { gte: range.from, lte: range.to }
    },
    select: {
      entityId: true,
      metaJson: true
    }
  });

  const ids = new Set<string>();
  for (const log of logs) {
    if (!isPlainObject(log.metaJson)) {
      continue;
    }
    const toValue = log.metaJson.to;
    if (toValue === DELIVERED_STATUS) {
      ids.add(log.entityId);
    }
  }
  return Array.from(ids);
}

export async function getAccountingSalesReport(range: AccountingRange, groupBy: AccountingGroupBy) {
  const [orders, receivedPayments] = await Promise.all([
    db.order.findMany({
      where: {
        status: { in: [...SALES_ORDER_STATUSES] },
        orderDate: { gte: range.from, lte: range.to }
      },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true
          }
        },
        items: {
          select: {
            qty: true,
            lineTotal: true,
            product: {
              select: {
                category: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { orderDate: "asc" }
    }),
    db.customerPayment.aggregate({
      where: { paidAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true }
    })
  ]);

  const byPeriodMap = new Map<string, BucketRow>();
  const byCategoryMap = new Map<
    string,
    {
      category: string;
      salesAmount: number;
      qty: number;
      lineCount: number;
    }
  >();
  const bySellerMap = new Map<
    string,
    {
      userId: string;
      displayName: string;
      salesAmount: number;
      orderCount: number;
      deliveredOrderCount: number;
      averageTicket: number;
    }
  >();

  let salesAmount = 0;
  let deliveredOrderCount = 0;
  let outstandingAmount = 0;

  for (const order of orders) {
    salesAmount += order.totalAmount;
    outstandingAmount += order.balance;
    const delivered = order.status === DELIVERED_STATUS;
    if (delivered) {
      deliveredOrderCount += 1;
    }

    const bucket = ensureBucket(byPeriodMap, order.orderDate, groupBy);
    bucket.salesAmount += order.totalAmount;
    bucket.orderCount += 1;
    bucket.deliveredOrderCount += delivered ? 1 : 0;

    const seller = bySellerMap.get(order.createdById) ?? {
      userId: order.createdById,
      displayName: order.createdBy.displayName,
      salesAmount: 0,
      orderCount: 0,
      deliveredOrderCount: 0,
      averageTicket: 0
    };
    seller.salesAmount += order.totalAmount;
    seller.orderCount += 1;
    seller.deliveredOrderCount += delivered ? 1 : 0;
    bySellerMap.set(order.createdById, seller);

    for (const item of order.items) {
      const categoryName = item.product?.category?.name ?? SERVICE_CATEGORY_LABEL;
      const category = byCategoryMap.get(categoryName) ?? {
        category: categoryName,
        salesAmount: 0,
        qty: 0,
        lineCount: 0
      };
      category.salesAmount += item.lineTotal;
      category.qty += item.qty;
      category.lineCount += 1;
      byCategoryMap.set(categoryName, category);
    }
  }

  const byPeriod = Array.from(byPeriodMap.values())
    .map((row) => ({
      period: row.period,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      salesAmount: round2(row.salesAmount),
      orderCount: row.orderCount,
      deliveredOrderCount: row.deliveredOrderCount
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const byCategory = Array.from(byCategoryMap.values())
    .map((row) => ({
      category: row.category,
      salesAmount: round2(row.salesAmount),
      qty: round2(row.qty),
      lineCount: row.lineCount
    }))
    .sort((a, b) => b.salesAmount - a.salesAmount);

  const bySeller = Array.from(bySellerMap.values())
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      salesAmount: round2(row.salesAmount),
      orderCount: row.orderCount,
      deliveredOrderCount: row.deliveredOrderCount,
      averageTicket: round2(row.orderCount > 0 ? row.salesAmount / row.orderCount : 0)
    }))
    .sort((a, b) => b.salesAmount - a.salesAmount);

  return {
    range: {
      from: toISODate(range.from),
      to: toISODate(range.to)
    },
    groupBy,
    totals: {
      salesAmount: round2(salesAmount),
      orderCount: orders.length,
      deliveredOrderCount,
      averageTicket: round2(orders.length > 0 ? salesAmount / orders.length : 0),
      outstandingAmount: round2(outstandingAmount),
      receivedPayments: round2(receivedPayments._sum.amount ?? 0)
    },
    byPeriod,
    byCategory,
    bySeller
  };
}

export async function getAccountingPurchasesReport(range: AccountingRange) {
  const [invoices, returns, payments] = await Promise.all([
    db.supplierInvoice.findMany({
      where: {
        status: { not: "CANCELLED" },
        issueDate: { gte: range.from, lte: range.to }
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { issueDate: "asc" }
    }),
    db.supplierReturn.findMany({
      where: {
        status: "CONFIRMED",
        date: { gte: range.from, lte: range.to }
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { date: "asc" }
    }),
    db.supplierPayment.findMany({
      where: { paidAt: { gte: range.from, lte: range.to } },
      include: {
        supplierInvoice: {
          select: {
            supplierId: true,
            supplier: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { paidAt: "asc" }
    })
  ]);

  const byMonthMap = new Map<string, BucketRow>();
  const bySupplierMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      invoicedAmount: number;
      returnAmount: number;
      netPurchases: number;
      paidAmount: number;
      outstandingAmount: number;
      invoiceCount: number;
      returnCount: number;
      paymentCount: number;
    }
  >();

  let invoicedAmount = 0;
  let returnAmount = 0;
  let paidAmount = 0;
  let outstandingAmount = 0;

  for (const invoice of invoices) {
    invoicedAmount += invoice.totalAmount;
    outstandingAmount += invoice.balance;
    const monthBucket = ensureBucket(byMonthMap, invoice.issueDate, "month");
    monthBucket.purchasesAmount += invoice.totalAmount;

    const supplier = bySupplierMap.get(invoice.supplierId) ?? {
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      invoicedAmount: 0,
      returnAmount: 0,
      netPurchases: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      invoiceCount: 0,
      returnCount: 0,
      paymentCount: 0
    };
    supplier.invoicedAmount += invoice.totalAmount;
    supplier.outstandingAmount += invoice.balance;
    supplier.invoiceCount += 1;
    bySupplierMap.set(invoice.supplierId, supplier);
  }

  for (const supplierReturn of returns) {
    returnAmount += supplierReturn.amount;
    const monthBucket = ensureBucket(byMonthMap, supplierReturn.date, "month");
    monthBucket.purchasesAmount -= supplierReturn.amount;

    const supplier = bySupplierMap.get(supplierReturn.supplierId) ?? {
      supplierId: supplierReturn.supplierId,
      supplierName: supplierReturn.supplier.name,
      invoicedAmount: 0,
      returnAmount: 0,
      netPurchases: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      invoiceCount: 0,
      returnCount: 0,
      paymentCount: 0
    };
    supplier.returnAmount += supplierReturn.amount;
    supplier.returnCount += 1;
    bySupplierMap.set(supplierReturn.supplierId, supplier);
  }

  for (const payment of payments) {
    const supplierId = payment.supplierInvoice.supplierId;
    const supplierName = payment.supplierInvoice.supplier.name;
    paidAmount += payment.amount;
    const monthBucket = ensureBucket(byMonthMap, payment.paidAt, "month");
    monthBucket.supplierOutflow += payment.amount;

    const supplier = bySupplierMap.get(supplierId) ?? {
      supplierId,
      supplierName,
      invoicedAmount: 0,
      returnAmount: 0,
      netPurchases: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      invoiceCount: 0,
      returnCount: 0,
      paymentCount: 0
    };
    supplier.paidAmount += payment.amount;
    supplier.paymentCount += 1;
    bySupplierMap.set(supplierId, supplier);
  }

  const byMonth = Array.from(byMonthMap.values())
    .map((row) => ({
      period: row.period,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      netPurchases: round2(row.purchasesAmount),
      supplierOutflow: round2(row.supplierOutflow)
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const bySupplier = Array.from(bySupplierMap.values())
    .map((row) => {
      const netPurchases = row.invoicedAmount - row.returnAmount;
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        invoicedAmount: round2(row.invoicedAmount),
        returnAmount: round2(row.returnAmount),
        netPurchases: round2(netPurchases),
        paidAmount: round2(row.paidAmount),
        outstandingAmount: round2(row.outstandingAmount),
        invoiceCount: row.invoiceCount,
        returnCount: row.returnCount,
        paymentCount: row.paymentCount
      };
    })
    .sort((a, b) => b.netPurchases - a.netPurchases);

  return {
    range: {
      from: toISODate(range.from),
      to: toISODate(range.to)
    },
    totals: {
      invoicedAmount: round2(invoicedAmount),
      returnAmount: round2(returnAmount),
      netPurchases: round2(invoicedAmount - returnAmount),
      paidAmount: round2(paidAmount),
      outstandingAmount: round2(outstandingAmount),
      invoiceCount: invoices.length,
      returnCount: returns.length,
      paymentCount: payments.length
    },
    byMonth,
    bySupplier
  };
}

export async function getAccountingProfitReport(range: AccountingRange) {
  const ids = await deliveredOrderIds(range);
  if (!ids.length) {
    return {
      range: {
        from: toISODate(range.from),
        to: toISODate(range.to)
      },
      totals: {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMarginPct: 0,
        deliveredOrderCount: 0
      },
      byCategory: [] as Array<{
        category: string;
        revenue: number;
        cogs: number;
        grossProfit: number;
        grossMarginPct: number;
      }>,
      bySeller: [] as Array<{
        userId: string;
        displayName: string;
        deliveredOrderCount: number;
        revenue: number;
        cogs: number;
        grossProfit: number;
        grossMarginPct: number;
      }>
    };
  }

  const [orders, outMovements] = await Promise.all([
    db.order.findMany({
      where: { id: { in: ids } },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true
          }
        },
        items: {
          select: {
            lineTotal: true,
            product: {
              select: {
                category: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    db.stockMovement.findMany({
      where: {
        type: "OUT",
        referenceType: "ORDER",
        referenceId: { in: ids }
      },
      include: {
        product: {
          select: {
            category: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })
  ]);

  const costByOrderId = new Map<string, number>();
  const byCategoryMap = new Map<
    string,
    {
      category: string;
      revenue: number;
      cogs: number;
    }
  >();
  const bySellerMap = new Map<
    string,
    {
      userId: string;
      displayName: string;
      deliveredOrderCount: number;
      revenue: number;
      cogs: number;
    }
  >();

  let totalRevenue = 0;
  for (const order of orders) {
    totalRevenue += order.totalAmount;

    const seller = bySellerMap.get(order.createdById) ?? {
      userId: order.createdById,
      displayName: order.createdBy.displayName,
      deliveredOrderCount: 0,
      revenue: 0,
      cogs: 0
    };
    seller.revenue += order.totalAmount;
    seller.deliveredOrderCount += 1;
    bySellerMap.set(order.createdById, seller);

    for (const item of order.items) {
      const categoryName = item.product?.category?.name ?? SERVICE_CATEGORY_LABEL;
      const category = byCategoryMap.get(categoryName) ?? {
        category: categoryName,
        revenue: 0,
        cogs: 0
      };
      category.revenue += item.lineTotal;
      byCategoryMap.set(categoryName, category);
    }
  }

  let totalCogs = 0;
  for (const movement of outMovements) {
    const cost = movement.qty * (movement.unitCost ?? 0);
    totalCogs += cost;

    if (movement.referenceId) {
      costByOrderId.set(movement.referenceId, (costByOrderId.get(movement.referenceId) ?? 0) + cost);
    }

    const categoryName = movement.product.category.name;
    const category = byCategoryMap.get(categoryName) ?? {
      category: categoryName,
      revenue: 0,
      cogs: 0
    };
    category.cogs += cost;
    byCategoryMap.set(categoryName, category);
  }

  for (const order of orders) {
    const seller = bySellerMap.get(order.createdById);
    if (!seller) {
      continue;
    }
    seller.cogs += costByOrderId.get(order.id) ?? 0;
    bySellerMap.set(order.createdById, seller);
  }

  const byCategory = Array.from(byCategoryMap.values())
    .map((row) => {
      const grossProfit = row.revenue - row.cogs;
      return {
        category: row.category,
        revenue: round2(row.revenue),
        cogs: round2(row.cogs),
        grossProfit: round2(grossProfit),
        grossMarginPct: round2(row.revenue > 0 ? (grossProfit / row.revenue) * 100 : 0)
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const bySeller = Array.from(bySellerMap.values())
    .map((row) => {
      const grossProfit = row.revenue - row.cogs;
      return {
        userId: row.userId,
        displayName: row.displayName,
        deliveredOrderCount: row.deliveredOrderCount,
        revenue: round2(row.revenue),
        cogs: round2(row.cogs),
        grossProfit: round2(grossProfit),
        grossMarginPct: round2(row.revenue > 0 ? (grossProfit / row.revenue) * 100 : 0)
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const grossProfit = totalRevenue - totalCogs;

  return {
    range: {
      from: toISODate(range.from),
      to: toISODate(range.to)
    },
    totals: {
      revenue: round2(totalRevenue),
      cogs: round2(totalCogs),
      grossProfit: round2(grossProfit),
      grossMarginPct: round2(totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0),
      deliveredOrderCount: orders.length
    },
    byCategory,
    bySeller
  };
}

export async function getAccountingCashflowReport(range: AccountingRange, groupBy: AccountingGroupBy) {
  const [customerPayments, supplierPayments] = await Promise.all([
    db.customerPayment.findMany({
      where: {
        paidAt: { gte: range.from, lte: range.to }
      },
      select: {
        amount: true,
        method: true,
        paidAt: true
      },
      orderBy: { paidAt: "asc" }
    }),
    db.supplierPayment.findMany({
      where: {
        paidAt: { gte: range.from, lte: range.to }
      },
      select: {
        amount: true,
        method: true,
        paidAt: true
      },
      orderBy: { paidAt: "asc" }
    })
  ]);

  const byPeriodMap = new Map<string, BucketRow>();
  const inflowByMethod: Record<"CASH" | "CARD" | "TRANSFER", number> = {
    CASH: 0,
    CARD: 0,
    TRANSFER: 0
  };
  const outflowByMethod: Record<"CASH" | "CARD" | "TRANSFER", number> = {
    CASH: 0,
    CARD: 0,
    TRANSFER: 0
  };

  let customerInflow = 0;
  let supplierOutflow = 0;

  for (const payment of customerPayments) {
    customerInflow += payment.amount;
    inflowByMethod[payment.method] += payment.amount;
    const bucket = ensureBucket(byPeriodMap, payment.paidAt, groupBy);
    bucket.customerInflow += payment.amount;
  }

  for (const payment of supplierPayments) {
    supplierOutflow += payment.amount;
    outflowByMethod[payment.method] += payment.amount;
    const bucket = ensureBucket(byPeriodMap, payment.paidAt, groupBy);
    bucket.supplierOutflow += payment.amount;
  }

  const byPeriod = Array.from(byPeriodMap.values())
    .map((row) => {
      const netCashflow = row.customerInflow - row.supplierOutflow;
      return {
        period: row.period,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        customerInflow: round2(row.customerInflow),
        supplierOutflow: round2(row.supplierOutflow),
        netCashflow: round2(netCashflow)
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const netCashflow = customerInflow - supplierOutflow;

  return {
    range: {
      from: toISODate(range.from),
      to: toISODate(range.to)
    },
    groupBy,
    totals: {
      customerInflow: round2(customerInflow),
      supplierOutflow: round2(supplierOutflow),
      netCashflow: round2(netCashflow),
      customerPaymentCount: customerPayments.length,
      supplierPaymentCount: supplierPayments.length
    },
    inflowByMethod: {
      CASH: round2(inflowByMethod.CASH),
      CARD: round2(inflowByMethod.CARD),
      TRANSFER: round2(inflowByMethod.TRANSFER),
      total: round2(customerInflow)
    },
    outflowByMethod: {
      CASH: round2(outflowByMethod.CASH),
      CARD: round2(outflowByMethod.CARD),
      TRANSFER: round2(outflowByMethod.TRANSFER),
      total: round2(supplierOutflow)
    },
    byPeriod
  };
}

export async function getAccountingSummaryReport(range: AccountingRange) {
  const [sales, purchases, profit, cashflow] = await Promise.all([
    getAccountingSalesReport(range, "day"),
    getAccountingPurchasesReport(range),
    getAccountingProfitReport(range),
    getAccountingCashflowReport(range, "day")
  ]);

  return {
    range: {
      from: toISODate(range.from),
      to: toISODate(range.to)
    },
    kpis: {
      salesAmount: sales.totals.salesAmount,
      netPurchases: purchases.totals.netPurchases,
      grossProfit: profit.totals.grossProfit,
      grossMarginPct: profit.totals.grossMarginPct,
      customerInflow: cashflow.totals.customerInflow,
      supplierOutflow: cashflow.totals.supplierOutflow,
      netCashflow: cashflow.totals.netCashflow
    },
    counts: {
      orderCount: sales.totals.orderCount,
      deliveredOrderCount: profit.totals.deliveredOrderCount,
      supplierInvoiceCount: purchases.totals.invoiceCount
    },
    highlights: {
      topCategories: profit.byCategory.slice(0, 5),
      topSellers: sales.bySeller.slice(0, 5),
      topSuppliers: purchases.bySupplier.slice(0, 5)
    }
  };
}

export { ADMIN_ONLY_MESSAGE };
export { ACCOUNTING_MAX_RANGE_DAYS, ACCOUNTING_DEFAULT_PAGE_SIZE, ACCOUNTING_MAX_PAGE_SIZE };
