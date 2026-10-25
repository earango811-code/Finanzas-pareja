// "Dictado" por texto libre: "45 mil mercado D1 compartido".
import { parseAmountString } from "./money";
import { normalize } from "./text";
import type { TxScope } from "./types";

export interface QuickCategory {
  id: string;
  name: string;
  aliases?: string[];
}

export interface QuickAccount {
  id: string;
  name: string;
  type: string;
}

export interface QuickEntryResult {
  amount: number | null;
  scope: TxScope | null;
  categoryId: string | null;
  accountId: string | null;
  merchant: string;
  dayOffset: number; // 0 hoy, -1 ayer, -2 anteayer
}

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  lukas: 1_000,
  luca: 1_000,
  lucas: 1_000,
  m: 1_000_000,
  millon: 1_000_000,
  millones: 1_000_000,
  palo: 1_000_000,
  palos: 1_000_000,
};

const SCOPE_WORDS: Record<string, TxScope> = {
  compartido: "compartido",
  compartida: "compartido",
  hogar: "compartido",
  casa: "compartido",
  juntos: "compartido",
  personal: "personal",
  mio: "personal",
  mia: "personal",
};

const DAY_WORDS: Record<string, number> = { hoy: 0, ayer: -1, anteayer: -2 };

const ACCOUNT_WORDS: Record<string, string> = {
  efectivo: "efectivo",
  cash: "efectivo",
  tc: "credito",
  credito: "credito",
  tarjeta: "credito",
  debito: "debito",
  td: "debito",
};

const STOP_WORDS = new Set(["de", "en", "el", "la", "los", "las", "con", "por", "para", "y", "pesos", "$"]);

/** Primer número del texto con su multiplicador opcional ("45 mil", "1,2M", "45k", "$45.000"). */
function extractAmount(tokens: string[]): { amount: number | null; used: Set<number> } {
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^\$?([\d.,]+)([a-z]*)$/);
    if (!m) continue;
    const base = parseAmountString(m[1]);
    if (base === null) continue;
    used.add(i);
    let mult = 1;
    if (m[2] && MULTIPLIERS[m[2]]) mult = MULTIPLIERS[m[2]];
    else if (tokens[i + 1] && MULTIPLIERS[tokens[i + 1]]) {
      mult = MULTIPLIERS[tokens[i + 1]];
      used.add(i + 1);
      if (tokens[i + 2] === "de" && mult === 1_000_000) used.add(i + 2); // "1 millón de pesos"
    }
    return { amount: Math.round(base * mult), used };
  }
  return { amount: null, used };
}

export function parseQuickEntry(
  text: string,
  categories: QuickCategory[],
  accounts: QuickAccount[] = [],
): QuickEntryResult {
  const original = text.trim().split(/\s+/).filter(Boolean);
  const tokens = original.map((t) => normalize(t).replace(/^[,;]+|[,;]+$/g, ""));
  const { amount, used } = extractAmount(tokens);

  let scope: TxScope | null = null;
  let dayOffset = 0;
  let accountType: string | null = null;
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    if (SCOPE_WORDS[t]) { scope = SCOPE_WORDS[t]; used.add(i); }
    else if (t in DAY_WORDS) { dayOffset = DAY_WORDS[t]; used.add(i); }
    else if (ACCOUNT_WORDS[t]) { accountType = ACCOUNT_WORDS[t]; used.add(i); }
  });

  // Categoría: la que tenga el nombre (o alias) con más palabras coincidentes.
  let categoryId: string | null = null;
  let bestScore = 0;
  let bestIdx: number[] = [];
  for (const c of categories) {
    for (const label of [c.name, ...(c.aliases ?? [])]) {
      const words = normalize(label).split(/[\s/]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      const idx = tokens.map((t, i) => (!used.has(i) && words.includes(t) ? i : -1)).filter((i) => i >= 0);
      if (idx.length > bestScore) {
        bestScore = idx.length;
        categoryId = c.id;
        bestIdx = idx;
      }
    }
  }
  bestIdx.forEach((i) => used.add(i));

  const accountId = accountType ? accounts.find((a) => a.type === accountType)?.id ?? null : null;

  const merchant = original
    .filter((_, i) => !used.has(i) && !STOP_WORDS.has(tokens[i]))
    .join(" ")
    .trim();

  return { amount, scope, categoryId, accountId, merchant, dayOffset };
}
