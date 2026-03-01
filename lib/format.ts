export function formatDZD(value: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

export function toISODateInput(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}