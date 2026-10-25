// Fechas contables en la zona horaria de Bogotá (UTC-5, sin horario de verano).

export const TZ = "America/Bogota";
const BOGOTA_OFFSET = "-05:00";

/** Fecha de hoy en Bogotá como "YYYY-MM-DD". */
export function todayBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Mes actual en Bogotá como "YYYY-MM". */
export function currentMonth(now: Date = new Date()): string {
  return todayBogota(now).slice(0, 7);
}

/** "2026-10" → { start: "2026-10-01", end: "2026-11-01" } (end exclusivo). */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function isValidMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** "2026-10" → "octubre 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** "2026-10-24" → "24 oct" */
export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
}

/**
 * Convierte "24/10/26" o "24/10/2026" + "09:54" (hora de Bogotá) a
 * { date: "2026-10-24", at: "2026-10-24T09:54:00-05:00" }.
 */
export function parseBankDate(dmy: string, hm?: string): { date: string; at: string | null } | null {
  const m = dmy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const date = `${year}-${month}-${day}`;
  if (!hm) return { date, at: null };
  const t = hm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!t) return { date, at: null };
  const at = `${date}T${t[1].padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}${BOGOTA_OFFSET}`;
  return { date, at };
}
