export function sumTotal(items: Array<{ qty: number; unitPrice?: number; unitCost?: number }>): number {
  return Number(
    items
      .reduce((sum, item) => sum + item.qty * (item.unitPrice ?? item.unitCost ?? 0), 0)
      .toFixed(2)
  );
}