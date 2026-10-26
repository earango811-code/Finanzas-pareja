// Presupuesto vs real y resumen 50/30/20.
import type { BudgetGroup, BudgetMode, TxKind, TxScope, TxStatus } from "./types";

export interface BudgetLine {
  id: string;
  category_id: string;
  member_id: string | null; // null = presupuesto compartido
  mode: BudgetMode;
  amount: number; // usado cuando mode = "fijo"
  remainder_share: number; // usado cuando mode = "resto" (0..1)
}

export interface CategoryInfo {
  id: string;
  name: string;
  budget_group: BudgetGroup | null; // null solo en categorías de ingreso
  parent_id?: string | null;
  is_income?: boolean;
}

/** Categoría principal: la subcategoría suma a su padre. */
export function rootCategoryId(id: string, byId: Map<string, Pick<CategoryInfo, "parent_id">>): string {
  return byId.get(id)?.parent_id ?? id;
}

export interface BudgetTx {
  amount: number;
  kind: TxKind;
  scope: TxScope | null;
  status: TxStatus;
  category_id: string | null;
  paid_by_member_id: string;
  pocket_id?: string | null; // pagado desde un bolsillo: no cuenta en el presupuesto del mes
}

export type AlertLevel = "ok" | "alerta" | "excedido";

export interface BudgetRow {
  budgetId: string;
  categoryId: string;
  name: string;
  group: BudgetGroup;
  budgeted: number;
  spent: number;
  ratio: number; // spent / budgeted
  alert: AlertLevel;
}

export function alertLevel(ratio: number): AlertLevel {
  if (ratio >= 1) return "excedido";
  if (ratio >= 0.8) return "alerta";
  return "ok";
}

/**
 * Monto efectivo de cada línea. Las líneas "resto" toman su porción de lo que
 * sobra del ingreso después de las líneas fijas del mismo ámbito (igual que el
 * Excel: Ahorro = (ingreso total − gastos fijos) × 50 %).
 */
export function resolveBudgetAmounts(lines: BudgetLine[], incomeBase: number): Map<string, number> {
  const fixed = lines.filter((l) => l.mode === "fijo").reduce((a, l) => a + l.amount, 0);
  const remainder = Math.max(0, incomeBase - fixed);
  return new Map(
    lines.map((l) => [l.id, l.mode === "fijo" ? l.amount : Math.round(remainder * l.remainder_share)]),
  );
}

/** Gasto neto (gastos − reembolsos) de una transacción para el presupuesto. */
function budgetEffect(t: BudgetTx): number {
  if (t.status !== "identificado" || t.pocket_id) return 0;
  if (t.kind === "gasto") return t.amount;
  if (t.kind === "ingreso" && t.category_id) return -t.amount; // devolución categorizada
  return 0;
}

/**
 * Filas de presupuesto de un ámbito.
 * - Compartido: líneas con member_id null vs transacciones scope "compartido".
 * - Personal de X: líneas con member_id X vs transacciones "personal" pagadas por X.
 * Las categorías con gasto pero sin presupuesto aparecen con presupuesto 0.
 */
export function buildBudgetRows(params: {
  lines: BudgetLine[];
  categories: CategoryInfo[];
  txs: BudgetTx[];
  incomeBase: number;
  memberId: string | null;
}): BudgetRow[] {
  const { categories, txs, incomeBase, memberId } = params;
  const lines = params.lines.filter((l) => l.member_id === memberId);
  const amounts = resolveBudgetAmounts(lines, incomeBase);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const spentByCat = new Map<string, number>();
  for (const t of txs) {
    if (!t.category_id) continue;
    const inScope =
      memberId === null
        ? t.scope === "compartido"
        : t.scope === "personal" && t.paid_by_member_id === memberId;
    if (!inScope) continue;
    const root = rootCategoryId(t.category_id, catById);
    if (catById.get(root)?.is_income) continue; // salario, prestaciones: no son gasto
    spentByCat.set(root, (spentByCat.get(root) ?? 0) + budgetEffect(t));
  }

  const rows: BudgetRow[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const c = catById.get(l.category_id);
    if (!c || !c.budget_group) continue;
    seen.add(c.id);
    const budgeted = amounts.get(l.id) ?? 0;
    const spent = spentByCat.get(c.id) ?? 0;
    const ratio = budgeted > 0 ? spent / budgeted : spent > 0 ? Infinity : 0;
    rows.push({ budgetId: l.id, categoryId: c.id, name: c.name, group: c.budget_group, budgeted, spent, ratio, alert: alertLevel(ratio) });
  }
  for (const [catId, spent] of spentByCat) {
    if (seen.has(catId) || spent === 0) continue;
    const c = catById.get(catId);
    if (!c || !c.budget_group) continue;
    rows.push({ budgetId: "", categoryId: c.id, name: c.name, group: c.budget_group, budgeted: 0, spent, ratio: Infinity, alert: "excedido" });
  }
  return rows;
}

export interface GroupSummary {
  group: BudgetGroup;
  target: number; // % meta (0.5, 0.3, 0.2)
  targetAmount: number;
  budgeted: number;
  spent: number;
  budgetedRatio: number; // budgeted / income
  spentRatio: number; // spent / income
}

export const DEFAULT_TARGETS: Record<BudgetGroup, number> = { necesidades: 0.5, deseos: 0.3, ahorro: 0.2 };

/** Resumen 50/30/20 calculado sobre las filas reales, no hardcodeado. */
export function summarizeGroups(
  rows: BudgetRow[],
  income: number,
  targets: Record<BudgetGroup, number> = DEFAULT_TARGETS,
): GroupSummary[] {
  return (Object.keys(targets) as BudgetGroup[]).map((group) => {
    const g = rows.filter((r) => r.group === group);
    const budgeted = g.reduce((a, r) => a + r.budgeted, 0);
    const spent = g.reduce((a, r) => a + r.spent, 0);
    return {
      group,
      target: targets[group],
      targetAmount: Math.round(income * targets[group]),
      budgeted,
      spent,
      budgetedRatio: income > 0 ? budgeted / income : 0,
      spentRatio: income > 0 ? spent / income : 0,
    };
  });
}

export interface BudgetCoverage {
  income: number;
  spending: number; // grupos de gasto
  saving: number; // grupos de ahorro (van a bolsillos)
  assigned: number; // spending + saving
  unassigned: number; // income − assigned (negativo = se pasaron)
  ratio: number; // assigned / income
}

/** Cuánto del ingreso cubre el presupuesto: la meta es asignar el 100 %. */
export function budgetCoverage(rows: BudgetRow[], income: number): BudgetCoverage {
  const saving = rows.filter((r) => r.group === "ahorro").reduce((a, r) => a + r.budgeted, 0);
  const spending = rows.filter((r) => r.group !== "ahorro").reduce((a, r) => a + r.budgeted, 0);
  const assigned = saving + spending;
  return { income, spending, saving, assigned, unassigned: income - assigned, ratio: income > 0 ? assigned / income : 0 };
}
