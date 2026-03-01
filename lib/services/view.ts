import { UserRole } from "@prisma/client";

export function sanitizeProductForRole<T extends { buyPrice?: number | null }>(role: UserRole, product: T): Omit<T, "buyPrice"> | T {
  if (!["ADMIN", "GESTIONNAIRE_STOCK"].includes(role)) {
    const { buyPrice, ...rest } = product;
    return rest;
  }
  return product;
}
