// Decide cómo entra al sistema un movimiento leído de una alerta.
import type { ParsedMovement } from "./parsers/bancolombia-email";
import { matchRule, type Rule } from "./rules";
import type { AccountType, TxKind, TxScope, TxStatus } from "./types";

export interface IngestAccount {
  id: string;
  owner_member_id: string;
  type: AccountType;
  last4: string | null;
  card_last4: string | null;
  is_active: boolean;
}

/**
 * Busca la cuenta de la alerta. Las alertas llegan al correo del titular, así que
 * primero se busca entre las cuentas de ese miembro.
 * - Tarjeta de crédito: por last4 entre cuentas de crédito.
 * - Débito / cuenta: por last4 de la cuenta o de la tarjeta débito asociada.
 * - Sin dígitos ("en tu cuenta de Ahorros"): su única cuenta débito, si tiene una sola.
 */
export function findAccount(
  accounts: IngestAccount[],
  memberId: string,
  hint: ParsedMovement["account"],
): IngestAccount | null {
  const mine = accounts.filter((a) => a.owner_member_id === memberId);
  const isCredit = hint.type === "credito";
  const sameKind = (a: IngestAccount) => (isCredit ? a.type === "credito" : a.type !== "credito" && a.type !== "efectivo");
  const matches = (a: IngestAccount) => a.last4 === hint.last4 || (!isCredit && a.card_last4 === hint.last4);

  if (!hint.last4) {
    const debit = mine.filter((a) => a.is_active && a.type === "debito");
    return debit.length === 1 ? debit[0] : null;
  }
  return (
    mine.find((a) => sameKind(a) && matches(a)) ??
    mine.find(matches) ??
    accounts.find((a) => sameKind(a) && matches(a)) ??
    null
  );
}

export interface RecurringCandidate {
  id: string;
  amount: number;
  occurred_on: string;
  paid_by_member_id: string;
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind;
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
}

/**
 * Una recurrente en Pendientes (recordatorio) que corresponde a esta alerta:
 * mismo miembro, mismo valor y tipo, ±3 días. Se toma la de fecha más cercana.
 */
export function matchRecurring(
  candidates: RecurringCandidate[],
  m: Pick<ParsedMovement, "amount" | "date" | "kind">,
  memberId: string,
  windowDays = 3,
): RecurringCandidate | null {
  const hits = candidates
    .filter((c) => c.paid_by_member_id === memberId && c.amount === m.amount && c.kind === m.kind && dayDiff(c.occurred_on, m.date) <= windowDays)
    .sort((a, b) => dayDiff(a.occurred_on, m.date) - dayDiff(b.occurred_on, m.date));
  return hits[0] ?? null;
}

export interface IngestRule extends Rule {
  auto_apply: boolean;
}

export interface Classification {
  status: TxStatus;
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind;
  appliedRuleId: string | null;
  matchedRecurringId: string | null;
}

/**
 * Prioridad: 1) recurrente que la estaba esperando, 2) regla automática,
 * 3) pendiente (la bandeja mostrará la sugerencia por regla o historial).
 */
export function classifyIncoming(
  m: Pick<ParsedMovement, "merchant" | "kind" | "amount" | "date">,
  memberId: string,
  rules: IngestRule[],
  recurring: RecurringCandidate[],
): Classification {
  const rec = matchRecurring(recurring, m, memberId);
  if (rec) {
    const complete = rec.scope !== null && (rec.category_id !== null || rec.kind === "ingreso");
    return {
      status: complete ? "identificado" : "pendiente",
      scope: rec.scope,
      category_id: rec.category_id,
      kind: rec.kind,
      appliedRuleId: null,
      matchedRecurringId: rec.id,
    };
  }

  const rule = matchRule(m.merchant, rules.filter((r) => r.auto_apply));
  if (rule) {
    const kind = rule.kind ?? m.kind;
    const isNonExpense = kind === "transferencia_interna" || kind === "pago_tarjeta";
    const complete = isNonExpense || (rule.scope !== null && (rule.category_id !== null || kind === "ingreso"));
    // Una regla de gasto no convierte un ingreso (ej. una devolución del mismo comercio) en gasto.
    if (complete && !(m.kind === "ingreso" && kind === "gasto")) {
      return {
        status: "identificado",
        scope: isNonExpense ? null : rule.scope,
        category_id: isNonExpense ? null : rule.category_id,
        kind,
        appliedRuleId: rule.id,
        matchedRecurringId: null,
      };
    }
  }

  return { status: "pendiente", scope: null, category_id: null, kind: m.kind, appliedRuleId: null, matchedRecurringId: null };
}
