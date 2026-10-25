// Dinero en pesos colombianos como enteros (sin decimales).

const COP = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** 1234567 → "$ 1.234.567" ; -5000 → "-$ 5.000" */
export function formatCOP(value: number): string {
  const rounded = Math.round(value);
  const abs = COP.format(Math.abs(rounded));
  return rounded < 0 ? `-$ ${abs}` : `$ ${abs}`;
}

/** 0.6775 → "67,8 %" */
export function formatPct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toLocaleString("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

/**
 * Convierte un número escrito con separadores colombianos o gringos a número.
 * Acepta: "52.819,86", "32,400.00", "32400.00", "280000", "1.500", "300,00", "$ 45.000".
 * Regla: si hay "." y "," el último es el decimal; si hay un solo tipo, es decimal
 * solo cuando aparece una vez y le siguen exactamente 1-2 dígitos al final.
 */
export function parseAmountString(input: string): number | null {
  const s = input.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    const isDecimal = parts.length === 2 && tail.length >= 1 && tail.length <= 2;
    normalized = isDecimal ? parts.join(".") : parts.join("");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Igual que parseAmountString pero redondeado a peso entero. */
export function parsePesos(input: string): number | null {
  const n = parseAmountString(input);
  return n === null ? null : Math.round(n);
}

/**
 * Reparte `total` en partes enteras proporcionales a `weights` sin perder pesos
 * (método del residuo mayor). La suma del resultado es exactamente `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (total < 0) return allocate(-total, weights).map((v) => -v);
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}
