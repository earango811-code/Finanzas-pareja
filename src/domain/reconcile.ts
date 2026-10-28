// Conciliación bancaria: cruza el extracto del banco con los movimientos de la app.
import type { Direction, StatementLine } from "./statement";
import type { TxKind } from "./types";

export interface AppTx {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  kind: TxKind;
  description: string;
}

export interface ReconcileResult {
  matched: { line: StatementLine; tx: AppTx }[];
  /** Está en el banco pero no en la app → agregar. */
  onlyInBank: StatementLine[];
  /** Está en la app pero no en el banco → quitar (o dejar si fue en efectivo / otro medio). */
  onlyInApp: AppTx[];
}

/** Días entre dos fechas YYYY-MM-DD. */
function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5;
}

/** Un ingreso entra (crédito), un gasto sale (débito); transferencias y pagos pueden ir en cualquier sentido. */
function directionFits(kind: TxKind, d: Direction): boolean {
  if (kind === "ingreso") return d === "credito";
  if (kind === "gasto") return d === "debito";
  return true;
}

/**
 * Empareja por valor exacto y sentido, con hasta `maxDays` de diferencia en la fecha
 * (el banco a veces registra la compra uno o dos días después). Ante varios candidatos,
 * gana el de fecha más cercana.
 */
export function reconcile(lines: StatementLine[], txs: AppTx[], maxDays = 3): ReconcileResult {
  const free = new Set(txs.map((t) => t.id));
  const matched: ReconcileResult["matched"] = [];
  const onlyInBank: StatementLine[] = [];
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date));
  for (const line of sorted) {
    let best: AppTx | null = null;
    let bestDays = Infinity;
    for (const t of txs) {
      if (!free.has(t.id) || t.amount !== line.amount || !directionFits(t.kind, line.direction)) continue;
      const d = daysBetween(t.date, line.date);
      if (d <= maxDays && d < bestDays) {
        best = t;
        bestDays = d;
      }
    }
    if (best) {
      free.delete(best.id);
      matched.push({ line, tx: best });
    } else onlyInBank.push(line);
  }
  return { matched, onlyInBank, onlyInApp: txs.filter((t) => free.has(t.id)) };
}
