// Tipos compartidos por la lógica de dominio y la base de datos.

export type TxStatus = "pendiente" | "identificado" | "ignorado";
export type TxScope = "compartido" | "personal";
export type TxKind = "gasto" | "ingreso" | "transferencia_interna" | "pago_tarjeta" | "liquidacion";
export type TxSource = "email" | "notificacion" | "csv" | "manual" | "recurrente";
export type AccountType = "debito" | "credito" | "efectivo" | "otro";
export type CategoryScope = "compartida" | "personal" | "ambas";
export type BudgetGroup = "necesidades" | "deseos" | "ahorro";
export type BudgetMode = "fijo" | "resto";

export const BUDGET_GROUP_LABEL: Record<BudgetGroup, string> = {
  necesidades: "Necesidades",
  deseos: "Deseos",
  ahorro: "Ahorro",
};

export const KIND_LABEL: Record<TxKind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  transferencia_interna: "Transferencia interna",
  pago_tarjeta: "Pago de tarjeta",
  liquidacion: "Liquidación entre nosotros",
};

export interface Member {
  id: string;
  display_name: string;
  monthly_income: number;
  income_deductions: number;
}

/** Ingreso neto que se usa para el reparto (ingreso − descuentos fijos). */
export function netIncome(m: Pick<Member, "monthly_income" | "income_deductions">): number {
  return Math.max(0, m.monthly_income - m.income_deductions);
}

/**
 * ¿El movimiento ya tiene lo necesario para contar? Un gasto compartido necesita grupo; uno
 * personal solo saber que es personal (lo personal no lleva categorías, solo una descripción);
 * un ingreso no necesita grupo. Transferencias, pagos de tarjeta y liquidaciones siempre.
 */
export function isComplete(t: { kind: TxKind; scope: TxScope | null; category_id: string | null }): boolean {
  if (t.kind !== "gasto" && t.kind !== "ingreso") return true;
  if (!t.scope) return false;
  return t.scope === "personal" || t.kind === "ingreso" || t.category_id !== null;
}
