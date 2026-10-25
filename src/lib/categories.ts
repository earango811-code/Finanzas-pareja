// Utilidades para la jerarquía categoría → subcategoría.
import type { CategoryScope } from "@/domain/types";
import type { CategoryRow } from "@/lib/db-types";

/** Lo que necesitan los selectores de categoría en el navegador. */
export interface CategoryOption {
  id: string;
  name: string;
  scope: CategoryScope;
  parentId: string | null;
  isIncome: boolean;
  hasChildren: boolean;
  aliases: string[];
}

export function toOptions(categories: CategoryRow[]): CategoryOption[] {
  const parents = new Set(categories.map((c) => c.parent_id).filter(Boolean));
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    scope: c.scope,
    parentId: c.parent_id,
    isIncome: c.is_income,
    hasChildren: parents.has(c.id),
    aliases: c.aliases,
  }));
}

/** "Salidas › Uber" o "Mercado". */
export function categoryLabel(id: string | null, byId: Map<string, Pick<CategoryRow, "name" | "parent_id">>): string {
  if (!id) return "Sin categoría";
  const c = byId.get(id);
  if (!c) return "—";
  const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
