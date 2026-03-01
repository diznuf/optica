import { OrderStatus } from "@prisma/client";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  BROUILLON: ["CONFIRMEE", "ANNULEE"],
  CONFIRMEE: ["EN_ATELIER", "ANNULEE"],
  EN_ATELIER: ["PRETE", "ANNULEE"],
  PRETE: ["LIVREE", "ANNULEE"],
  LIVREE: [],
  ANNULEE: []
};

export function canTransitionOrder(current: OrderStatus, target: OrderStatus, isAdmin: boolean): boolean {
  if (current === target) {
    return true;
  }

  if (current === "LIVREE" && target === "ANNULEE") {
    return isAdmin;
  }

  return transitions[current].includes(target);
}