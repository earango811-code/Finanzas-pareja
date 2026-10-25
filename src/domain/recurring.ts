// Fechas de transacciones recurrentes. Fechas como "YYYY-MM-DD" (calendario, sin hora).

export type Frequency = "semanal" | "cada_2_semanas" | "quincenal" | "mensual" | "bimestral" | "trimestral" | "anual";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  semanal: "Cada semana",
  cada_2_semanas: "Cada 2 semanas",
  quincenal: "Quincenal (día 15 y último)",
  mensual: "Cada mes",
  bimestral: "Cada 2 meses",
  trimestral: "Cada 3 meses",
  anual: "Cada año",
};

const MONTH_STEP: Partial<Record<Frequency, number>> = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 };

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Suma meses conservando el día ancla; si el mes es más corto, usa su último día (31 → 28 feb). */
export function addMonths(iso: string, months: number, anchorDay: number): string {
  const { y, m } = parts(iso);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return fmt(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

/** Siguiente fecha de quincena (15 o último día del mes) estrictamente después de `iso`. */
function nextQuincena(iso: string): string {
  const { y, m, d } = parts(iso);
  const last = daysInMonth(y, m);
  if (d < 15) return fmt(y, m, 15);
  if (d < last) return fmt(y, m, last);
  return m === 12 ? fmt(y + 1, 1, 15) : fmt(y, m + 1, 15);
}

/** Primera ocurrencia en o después de la fecha de inicio. */
export function firstOccurrence(startDate: string, frequency: Frequency): string {
  if (frequency !== "quincenal") return startDate;
  const { y, m, d } = parts(startDate);
  return d === 15 || d === daysInMonth(y, m) ? startDate : nextQuincena(startDate);
}

/** Ocurrencia siguiente a `current`. El día ancla sale de la fecha de inicio. */
export function nextOccurrence(current: string, frequency: Frequency, startDate: string): string {
  if (frequency === "semanal") return addDays(current, 7);
  if (frequency === "cada_2_semanas") return addDays(current, 14);
  if (frequency === "quincenal") return nextQuincena(current);
  return addMonths(current, MONTH_STEP[frequency]!, parts(startDate).d);
}

export interface RecurringSchedule {
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  next_date: string;
}

/**
 * Ocurrencias vencidas (≤ hoy) que faltan por generar y la nueva `next_date`.
 * `max` evita generar cientos de movimientos si alguien pone una fecha de inicio muy vieja.
 */
export function dueOccurrences(
  s: RecurringSchedule,
  today: string,
  max = 60,
): { dates: string[]; nextDate: string; finished: boolean } {
  const dates: string[] = [];
  let d = s.next_date;
  while (d <= today && (!s.end_date || d <= s.end_date) && dates.length < max) {
    dates.push(d);
    d = nextOccurrence(d, s.frequency, s.start_date);
  }
  return { dates, nextDate: d, finished: !!s.end_date && d > s.end_date };
}

/** Primera ocurrencia del calendario (desde la fecha de inicio) que cae en o después de `date`. */
export function firstOnOrAfter(frequency: Frequency, startDate: string, date: string): string {
  let d = firstOccurrence(startDate, frequency);
  for (let i = 0; d < date && i < 2000; i++) d = nextOccurrence(d, frequency, startDate);
  return d;
}

/** Próximas `n` fechas desde `next_date` (para mostrar el calendario). */
export function upcoming(s: RecurringSchedule, n: number): string[] {
  const out: string[] = [];
  let d = s.next_date;
  while (out.length < n && (!s.end_date || d <= s.end_date)) {
    out.push(d);
    d = nextOccurrence(d, s.frequency, s.start_date);
  }
  return out;
}

/** Valor mensual equivalente, para mostrar cuánto pesan las recurrentes en el presupuesto. */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  const perYear: Record<Frequency, number> = {
    semanal: 52,
    cada_2_semanas: 26,
    quincenal: 24,
    mensual: 12,
    bimestral: 6,
    trimestral: 4,
    anual: 1,
  };
  return Math.round((amount * perYear[frequency]) / 12);
}

export function recurringDedupeHash(recurringId: string, date: string): string {
  return `rec:${recurringId}:${date}`;
}
