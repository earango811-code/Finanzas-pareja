// Reglas al editar un movimiento ya registrado (desde el detalle del movimiento).
import type { TxKind, TxScope, TxStatus } from "@/domain/types";

export interface TxEdit {
  kind: TxKind;
  date: string; // YYYY-MM-DD
  budgetMonth: string | null; // YYYY-MM o null = el mes de la fecha
  scope: TxScope | null;
  categoryId: string | null;
  pocketId: string | null;
  paidBy: string;
  counterpartyId: string | null;
}

/**
 * Deja el movimiento coherente con su tipo y calcula el nuevo estado:
 * - transferencias y pagos de tarjeta no llevan ámbito, categoría ni bolsillo;
 * - una liquidación necesita a quién se le pagó (distinto de quien pagó);
 * - un gasto o ingreso queda identificado si tiene ámbito y (categoría o es ingreso), si no, pendiente;
 * - un ignorado sigue ignorado hasta que lo restauren;
 * - el mes del presupuesto se guarda solo si es distinto al de la fecha.
 */
export function normalizeTxEdit(
  e: TxEdit,
  currentStatus: TxStatus,
): { value: TxEdit; status: TxStatus } | { error: string } {
  const isSpend = e.kind === "gasto" || e.kind === "ingreso";
  const value: TxEdit = {
    ...e,
    scope: isSpend ? e.scope : null,
    categoryId: isSpend ? e.categoryId : null,
    pocketId: isSpend ? e.pocketId : null,
    counterpartyId: e.kind === "liquidacion" ? e.counterpartyId : null,
    budgetMonth: e.budgetMonth && e.budgetMonth !== e.date.slice(0, 7) ? e.budgetMonth : null,
  };
  if (e.kind === "liquidacion") {
    if (!value.counterpartyId) return { error: "Falta a quién se le pagó" };
    if (value.counterpartyId === e.paidBy) return { error: "Quien paga y quien recibe deben ser distintos" };
  }
  if (value.pocketId && !value.scope) return { error: "Para pagar desde un bolsillo elige compartido o personal" };

  let status: TxStatus;
  if (currentStatus === "ignorado") status = "ignorado";
  else if (!isSpend) status = "identificado";
  else status = value.scope && (value.categoryId || e.kind === "ingreso") ? "identificado" : "pendiente";
  return { value, status };
}
