import { UserRole } from "@prisma/client";

export type Resource =
  | "users"
  | "patients"
  | "prescriptions"
  | "products"
  | "stock"
  | "suppliers"
  | "purchasing"
  | "supplier_finance"
  | "orders"
  | "reports"
  | "settings"
  | "backups";

export type Action = "read" | "write" | "delete" | "manage";

type Grant = Record<Resource, Action[]>;

const allActions: Action[] = ["read", "write", "delete", "manage"];

const grants: Record<UserRole, Grant> = {
  ADMIN: {
    users: allActions,
    patients: allActions,
    prescriptions: allActions,
    products: allActions,
    stock: allActions,
    suppliers: allActions,
    purchasing: allActions,
    supplier_finance: allActions,
    orders: allActions,
    reports: allActions,
    settings: allActions,
    backups: allActions
  },
  OPTICIEN: {
    users: [],
    patients: ["read", "write"],
    prescriptions: ["read", "write"],
    products: ["read"],
    stock: ["read"],
    suppliers: [],
    purchasing: [],
    supplier_finance: [],
    orders: ["read", "write"],
    reports: ["read"],
    settings: [],
    backups: []
  },
  GESTIONNAIRE_STOCK: {
    users: [],
    patients: ["read"],
    prescriptions: ["read"],
    products: ["read", "write"],
    stock: ["read", "write"],
    suppliers: ["read", "write"],
    purchasing: ["read", "write"],
    supplier_finance: ["read", "write"],
    orders: ["read"],
    reports: ["read"],
    settings: [],
    backups: []
  },
  VENDEUR: {
    users: [],
    patients: ["read", "write"],
    prescriptions: ["read", "write"],
    products: ["read"],
    stock: ["read"],
    suppliers: [],
    purchasing: [],
    supplier_finance: [],
    orders: ["read", "write"],
    reports: ["read"],
    settings: [],
    backups: []
  }
};

export function can(role: UserRole, action: Action, resource: Resource): boolean {
  return grants[role][resource].includes(action) || grants[role][resource].includes("manage");
}
