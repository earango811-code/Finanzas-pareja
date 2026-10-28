// Lectura del extracto del banco (CSV o texto copiado) para la conciliación del cierre de mes.
// Acepta el CSV que descarga Bancolombia (sin encabezado) y archivos con encabezado tipo
// "Fecha; Descripción; Valor" o con columnas separadas de Débito / Crédito.

export type Direction = "debito" | "credito"; // débito = sale plata ; crédito = entra plata

export interface StatementLine {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // pesos, siempre positivo
  direction: Direction;
}

/** Divide una línea CSV respetando comillas. */
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 10);
  const score = (sep: string) => sample.reduce((a, l) => a + splitCsv(l, sep).length - 1, 0);
  return ["\t", ";", ",", "|"].reduce((best, sep) => (score(sep) > score(best) ? sep : best), "\t");
}

/** "01/10/2026", "2026-10-01", "2026/10/01", "20261001", "1/10/26" → "2026-10-01". */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(20\d{2})(\d{2})(\d{2})$/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * "-57.500", "57.500,00", "-57500.00", "$ 1.234.567", "(12.000)" → número con signo (pesos enteros).
 * null si no es un valor.
 */
export function parseStatementAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s|\$|COP/gi, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // El último separador es el decimal
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    // "57,50" decimal ; "1,234,567" miles
    normalized = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.split(",").join("");
  } else if (lastDot >= 0) {
    // "57.500" o "1.234.567" miles (formato colombiano) ; "57500.00" decimal
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.split(".").join("") : s;
  } else normalized = s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(negative ? -n : n);
}

const isAccountLike = (s: string) => /^\d{6,}$/.test(s.replace(/[-\s]/g, "")) && !parseStatementDate(s);

export interface ParseResult {
  lines: StatementLine[];
  skipped: number; // filas que no se pudieron leer
}

/**
 * Lee el extracto. Con encabezado usa las columnas Fecha / Descripción / Valor (o Débito y
 * Crédito). Sin encabezado (CSV de Bancolombia) toma en cada fila la primera fecha, el primer
 * valor después de ella y el texto más largo como descripción.
 * Signo: negativo = débito (salida). `invertSigns` es para extractos de tarjeta de crédito
 * donde las compras vienen en positivo.
 */
export function parseStatement(text: string, opts: { invertSigns?: boolean } = {}): ParseResult {
  const raw = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (raw.length === 0) return { lines: [], skipped: 0 };
  const sep = detectSeparator(raw);
  const rows = raw.map((l) => splitCsv(l, sep));

  const headerIdx = rows.findIndex((r) => r.some((c) => /^fecha/i.test(c)) && r.some((c) => /valor|monto|importe|d[eé]bito|cr[eé]dito/i.test(c)));
  const lines: StatementLine[] = [];
  let skipped = 0;
  const push = (date: string | null, description: string, signed: number | null) => {
    if (!date || signed === null || signed === 0) {
      skipped++;
      return;
    }
    const s = opts.invertSigns ? -signed : signed;
    lines.push({ date, description: description.replace(/\s+/g, " ").trim() || "Movimiento", amount: Math.abs(s), direction: s < 0 ? "debito" : "credito" });
  };

  if (headerIdx >= 0) {
    const h = rows[headerIdx].map((c) => c.toLowerCase());
    const find = (re: RegExp) => h.findIndex((c) => re.test(c));
    const iDate = find(/^fecha/);
    const iDesc = find(/descrip|concepto|detalle|referencia|movimiento/);
    const iDebit = find(/d[eé]bito|cargo|retiro|salida/);
    const iCredit = find(/cr[eé]dito|abono|dep[oó]sito|entrada/);
    const iValue = find(/^valor|monto|importe/);
    for (const r of rows.slice(headerIdx + 1)) {
      const date = parseStatementDate(r[iDate] ?? "");
      let signed: number | null = null;
      if (iDebit >= 0 || iCredit >= 0) {
        const d = iDebit >= 0 ? parseStatementAmount(r[iDebit] ?? "") : null;
        const c = iCredit >= 0 ? parseStatementAmount(r[iCredit] ?? "") : null;
        if (d) signed = -Math.abs(d);
        else if (c) signed = Math.abs(c);
      } else if (iValue >= 0) signed = parseStatementAmount(r[iValue] ?? "");
      push(date, iDesc >= 0 ? (r[iDesc] ?? "") : "", signed);
    }
    return { lines, skipped };
  }

  for (const r of rows) {
    const di = r.findIndex((c) => parseStatementDate(c) !== null);
    if (di < 0) {
      skipped++;
      continue;
    }
    let signed: number | null = null;
    for (const c of r.slice(di + 1)) {
      if (!c || isAccountLike(c) || parseStatementDate(c)) continue;
      if (!/[.,]/.test(c) && !c.startsWith("-") && c.replace(/\D/g, "").length <= 4) continue; // códigos cortos
      const v = parseStatementAmount(c);
      if (v !== null) {
        signed = v;
        break;
      }
    }
    const description = r.filter((c) => /[a-záéíóúñ]{3,}/i.test(c)).sort((a, b) => b.length - a.length)[0] ?? "";
    push(parseStatementDate(r[di]), description, signed);
  }
  return { lines, skipped };
}
