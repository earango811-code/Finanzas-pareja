// Reparto del presupuesto compartido y cálculo de "quién le debe a quién".
import { allocate } from "./money";
import { netIncome, type Member, type TxKind, type TxScope, type TxStatus } from "./types";

export interface SplitShare {
  memberId: string;
  ratio: number; // 0..1
}

/** % de cada miembro según su ingreso neto. Si nadie tiene ingreso, mitad y mitad. */
export function splitShares(members: Member[]): SplitShare[] {
  const incomes = members.map(netIncome);
  const total = incomes.reduce((a, b) => a + b, 0);
  return members.map((m, i) => ({
    memberId: m.id,
    ratio: total > 0 ? incomes[i] / total : 1 / members.length,
  }));
}

export interface SettlementTx {
  amount: number; // siempre positivo
  kind: TxKind;
  scope: TxScope | null;
  status: TxStatus;
  paid_by_member_id: string;
  counterparty_member_id?: string | null;
}

export interface MemberBalance {
  memberId: string;
  paid: number; // lo que pagó de lo compartido (neto de reembolsos)
  owes: number; // su parte del total compartido
  settled: number; // liquidaciones enviadas − recibidas
  balance: number; // > 0: le deben ; < 0: debe
}

export interface SettlementResult {
  sharedTotal: number;
  balances: MemberBalance[];
  /** null si están a paz y salvo. */
  transfer: { from: string; to: string; amount: number } | null;
}

/**
 * Reglas:
 * - Solo cuentan movimientos IDENTIFICADOS.
 * - Gasto compartido suma al total; ingreso compartido (reembolso, devolución) resta.
 * - Transferencias internas y pagos de tarjeta no cuentan.
 * - Una liquidación de A hacia B reduce lo que A debe.
 */
export function computeSettlement(members: Member[], txs: SettlementTx[]): SettlementResult {
  const ids = members.map((m) => m.id);
  const paid = new Map(ids.map((id) => [id, 0]));
  const settled = new Map(ids.map((id) => [id, 0]));
  let sharedTotal = 0;

  for (const t of txs) {
    if (t.status !== "identificado") continue;
    if (t.kind === "liquidacion") {
      const to = t.counterparty_member_id;
      if (!to || !paid.has(t.paid_by_member_id) || !paid.has(to)) continue;
      settled.set(t.paid_by_member_id, settled.get(t.paid_by_member_id)! + t.amount);
      settled.set(to, settled.get(to)! - t.amount);
      continue;
    }
    if (t.scope !== "compartido") continue;
    const sign = t.kind === "gasto" ? 1 : t.kind === "ingreso" ? -1 : 0;
    if (sign === 0 || !paid.has(t.paid_by_member_id)) continue;
    sharedTotal += sign * t.amount;
    paid.set(t.paid_by_member_id, paid.get(t.paid_by_member_id)! + sign * t.amount);
  }

  const shares = splitShares(members);
  const owesArr = allocate(sharedTotal, shares.map((s) => s.ratio));
  const balances: MemberBalance[] = ids.map((id, i) => {
    const p = paid.get(id)!;
    const s = settled.get(id)!;
    return { memberId: id, paid: p, owes: owesArr[i], settled: s, balance: p - owesArr[i] + s };
  });

  const creditor = balances.reduce((a, b) => (b.balance > a.balance ? b : a));
  const debtor = balances.reduce((a, b) => (b.balance < a.balance ? b : a));
  const amount = Math.min(creditor.balance, -debtor.balance);
  const transfer =
    amount > 0 && creditor.memberId !== debtor.memberId
      ? { from: debtor.memberId, to: creditor.memberId, amount }
      : null;

  return { sharedTotal, balances, transfer };
}
