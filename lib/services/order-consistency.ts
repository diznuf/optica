type OrderItemLike = {
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type OrderFinancialLike = {
  totalAmount: number;
  paidAmount?: number | null;
  balance?: number | null;
  items: OrderItemLike[];
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function computeOrderItemsTotal(items: OrderItemLike[]) {
  return round2(items.reduce((sum, item) => sum + round2(item.qty * item.unitPrice), 0));
}

export function evaluateOrderFinancialConsistency(order: OrderFinancialLike) {
  const computedLinesTotal = computeOrderItemsTotal(order.items);
  const persistedLinesTotal = round2(order.items.reduce((sum, item) => sum + item.lineTotal, 0));
  const persistedOrderTotal = round2(order.totalAmount);

  const lineTotalDiff = round2(computedLinesTotal - persistedLinesTotal);
  const orderTotalDiff = round2(computedLinesTotal - persistedOrderTotal);

  const expectedBalance =
    order.paidAmount !== undefined && order.paidAmount !== null
      ? round2(persistedOrderTotal - round2(order.paidAmount))
      : undefined;
  const balanceDiff =
    expectedBalance !== undefined && order.balance !== undefined && order.balance !== null
      ? round2(expectedBalance - round2(order.balance))
      : undefined;

  const isConsistent =
    Math.abs(lineTotalDiff) <= 0.01 &&
    Math.abs(orderTotalDiff) <= 0.01 &&
    (balanceDiff === undefined || Math.abs(balanceDiff) <= 0.01);

  return {
    isConsistent,
    computedLinesTotal,
    persistedLinesTotal,
    persistedOrderTotal,
    lineTotalDiff,
    orderTotalDiff,
    expectedBalance,
    balanceDiff
  };
}
