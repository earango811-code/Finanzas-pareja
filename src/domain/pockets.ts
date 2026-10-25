// Bolsillos: plata apartada para un fin (viaje, imprevistos…).
import type { BudgetRow } from "./budget";
import type { TxKind, TxScope, TxStatus } from "./types";

export type PocketMovementKind = "aporte" | "sobrante" | "retiro";

export interface PocketMovement {
  kind: PocketMovementKind;
  amount: number;
}

/** Movimiento real marcado como "pagado desde este bolsillo". */
export interface PocketTx {
  amount: number;
  kind: TxKind;
  status: TxStatus;
}

export interface PocketSummary {
  balance: number;
  contributed: number; // aportes + sobrantes
  spent: number; // retiros + gastos pagados desde el bolsillo (neto de devoluciones)
  progress: number | null; // saldo / meta (0..1+), null sin meta
}

/** Saldo = inicial + aportes + sobrantes − retiros − gastos pagados desde el bolsillo. */
export function pocketSummary(
  pocket: { opening_balance: number; target_amount: number | null },
  movements: PocketMovement[],
  txs: PocketTx[],
): PocketSummary {
  let contributed = 0;
  let spent = 0;
  for (const m of movements) {
    if (m.kind === "retiro") spent += m.amount;
    else contributed += m.amount;
  }
  for (const t of txs) {
    if (t.status !== "identificado") continue;
    if (t.kind === "gasto") spent += t.amount;
    else if (t.kind === "ingreso") spent -= t.amount; // devolución vuelve al bolsillo
  }
  const balance = pocket.opening_balance + contributed - spent;
  return {
    balance,
    contributed,
    spent,
    progress: pocket.target_amount ? balance / pocket.target_amount : null,
  };
}

/**
 * Sobrante del mes: presupuesto para gastar (sin el grupo Ahorro) menos lo gastado.
 * Es lo que se puede pasar a un bolsillo al cerrar el mes. Nunca negativo.
 */
export function monthLeftover(rows: BudgetRow[]): number {
  const spendRows = rows.filter((r) => r.group !== "ahorro");
  const budgeted = spendRows.reduce((a, r) => a + r.budgeted, 0);
  const spent = spendRows.reduce((a, r) => a + r.spent, 0);
  return Math.max(0, budgeted - spent);
}

/**
 * Un gasto compartido solo se puede pagar desde un bolsillo compartido; uno personal,
 * solo desde un bolsillo personal de quien pagó.
 */
export function pocketFitsTx(
  pocketOwner: string | null,
  tx: { scope: TxScope | null; paid_by_member_id: string },
): boolean {
  if (tx.scope === "compartido") return pocketOwner === null;
  if (tx.scope === "personal") return pocketOwner === tx.paid_by_member_id;
  return false;
}
