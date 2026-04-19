/**
 * Shopping list — tipi condivisi tra mobile e api.
 * Lista unica condivisa famiglia, ispirata al vecchio home-panel.
 */

export const SHOPPING_CATEGORIES = [
  "fruits",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "other",
] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const SHOPPING_UNITS = [
  "pz",
  "kg",
  "g",
  "l",
  "ml",
  "confezione",
  "bottiglia",
  "lattina",
  "barattolo",
  "scatola",
  "busta",
  "other",
] as const;
export type ShoppingUnit = (typeof SHOPPING_UNITS)[number];

export interface AuditEntry {
  action: "added" | "completed" | "uncompleted" | "updated" | "removed";
  at: string;
  by: string | null;
  diff?: Record<string, [unknown, unknown]>;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  unit: ShoppingUnit;
  category: ShoppingCategory;
  completed: boolean;
  addedAt: string;
  addedBy: string | null;
  auditLog: AuditEntry[];
}

export interface CreateShoppingItemInput {
  name: string;
  quantity?: string;
  unit?: ShoppingUnit;
  category?: ShoppingCategory;
  addedBy?: string | null;
}

export interface UpdateShoppingItemInput {
  name?: string;
  quantity?: string;
  unit?: ShoppingUnit;
  category?: ShoppingCategory;
  completed?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: ShoppingCategory;
  defaultUnit: ShoppingUnit;
}
