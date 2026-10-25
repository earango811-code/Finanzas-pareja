/** Minúsculas, sin tildes y con espacios simples. Para comparar textos. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nombre de comercio normalizado para reglas e historial:
 * "RAPPI COLOMBIA*DL" → "rappi colombia dl", "TRADER JOES 776" → "trader joes".
 * Quita números de sucursal al final ("776", "T0877") y signos, pero no
 * nombres cortos como "D1".
 */
export function normalizeMerchant(s: string): string {
  return normalize(s)
    .replace(/[*#/_.,-]+/g, " ")
    .replace(/(\s+(?:\d{2,}|[a-z]\d{3,}))+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Enmascara secuencias largas de dígitos (cuentas, llaves, celulares, cédulas)
 * dejando solo los últimos 4: "3001234567" → "******4567".
 * Las fechas, horas y valores no se tocan porque tienen separadores o son cortos.
 */
export function redactSensitive(s: string): string {
  return s.replace(/\d{6,}/g, (m) => "*".repeat(m.length - 4) + m.slice(-4));
}
