// Autocategorización: reglas explícitas primero, luego historial del mismo comercio.
import { normalizeMerchant } from "./text";
import type { TxKind, TxScope } from "./types";

export interface Rule {
  id: string;
  pattern: string; // texto que debe contener el comercio
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind | null;
  priority: number;
}

export interface HistoryItem {
  merchant: string | null;
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind;
}

export interface Suggestion {
  scope: TxScope | null;
  categoryId: string | null;
  kind: TxKind | null;
  source: "regla" | "historial";
  ruleId?: string;
  confidence: number; // 0..1
}

export function matchRule(merchant: string, rules: Rule[]): Rule | null {
  const m = normalizeMerchant(merchant);
  if (!m) return null;
  const hits = rules.filter((r) => {
    const p = normalizeMerchant(r.pattern);
    return p.length > 0 && m.includes(p);
  });
  if (hits.length === 0) return null;
  // Mayor prioridad gana; a igual prioridad, el patrón más específico (más largo).
  hits.sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);
  return hits[0];
}

export function suggest(merchant: string | null, rules: Rule[], history: HistoryItem[]): Suggestion | null {
  if (!merchant) return null;
  const rule = matchRule(merchant, rules);
  if (rule) {
    return { scope: rule.scope, categoryId: rule.category_id, kind: rule.kind, source: "regla", ruleId: rule.id, confidence: 1 };
  }
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  const counts = new Map<string, { n: number; item: HistoryItem }>();
  let total = 0;
  for (const h of history) {
    if (!h.merchant || normalizeMerchant(h.merchant) !== key) continue;
    total++;
    const k = `${h.kind}|${h.scope}|${h.category_id}`;
    const c = counts.get(k);
    counts.set(k, { n: (c?.n ?? 0) + 1, item: h });
  }
  if (total === 0) return null;
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return {
    scope: best.item.scope,
    categoryId: best.item.category_id,
    kind: best.item.kind,
    source: "historial",
    confidence: best.n / total,
  };
}

/** Patrón sugerido al marcar "recordar para este comercio". */
export function rulePatternFor(merchant: string): string {
  return normalizeMerchant(merchant);
}
