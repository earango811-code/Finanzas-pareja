// Color e ícono de cada grupo y categoría (estilo Buddy: círculo de color con un ícono).
// Los colores son variables CSS (--g-*) con su versión para modo oscuro en globals.css;
// la paleta de los grupos de gasto está validada para daltonismo.

export interface Visual {
  color: string; // valor CSS, ej. "var(--g-comida)"
  icon: string;
}

const GROUPS: Record<string, Visual> = {
  Mercado: { color: "var(--g-comida)", icon: "🛒" },
  "Gastos de casa": { color: "var(--g-casa)", icon: "🏠" },
  Ingresos: { color: "var(--g-ingresos)", icon: "💰" },
  Salidas: { color: "var(--g-salidas)", icon: "🎉" },
  Ahorros: { color: "var(--g-ahorros)", icon: "🐷" },
  Transporte: { color: "var(--g-transporte)", icon: "🚗" },
};

const CATEGORY_ICONS: Record<string, string> = {
  Alimentos: "🥦",
  Bebidas: "🍸",
  "Café": "☕",
  Caramelos: "🍬",
  Comida: "🍽️",
  Agua: "💧",
  Electricidad: "⚡",
  Internet: "📶",
  TV: "📺",
  "Teléfono": "📱",
  Prestaciones: "🎁",
  Salario: "💵",
  Cine: "🎬",
  "Restaurante v2": "🍷",
  Rumba: "🪩",
  "Ahorros para imprevistos": "⭐",
  "Ahorros para vacaciones": "🏖️",
  Inversiones: "📈",
  Combustible: "⛽",
  "Gastos de carro": "🔧",
  Uber: "🚕",
};

// Grupos nuevos que creen ustedes: se les asigna un color de esta lista en orden fijo.
const EXTRA_COLORS = ["var(--g-extra1)", "var(--g-extra2)", "var(--g-extra3)"];

export const NEUTRAL: Visual = { color: "var(--g-neutral)", icon: "❔" };

interface CatLike {
  id: string;
  name: string;
  parent_id?: string | null;
  parentId?: string | null;
}

function groupVisual(group: CatLike, allGroups: CatLike[]): Visual {
  const known = GROUPS[group.name];
  if (known) return known;
  const extras = allGroups.filter((g) => !GROUPS[g.name]).map((g) => g.id);
  const idx = Math.max(0, extras.indexOf(group.id));
  return { color: EXTRA_COLORS[idx % EXTRA_COLORS.length], icon: group.name.slice(0, 1).toUpperCase() };
}

/**
 * Visual de una categoría o grupo. Las categorías heredan el color de su grupo y
 * tienen su propio ícono (o el del grupo si no hay uno definido).
 */
export function visualFor(id: string | null | undefined, categories: CatLike[]): Visual {
  if (!id) return NEUTRAL;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const c = byId.get(id);
  if (!c) return NEUTRAL;
  const parentId = c.parent_id ?? c.parentId ?? null;
  const groups = categories.filter((x) => !(x.parent_id ?? x.parentId));
  if (!parentId) return groupVisual(c, groups);
  const parent = byId.get(parentId);
  const g = parent ? groupVisual(parent, groups) : NEUTRAL;
  return { color: g.color, icon: CATEGORY_ICONS[c.name] ?? g.icon };
}
