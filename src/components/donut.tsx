// Dona de gasto por grupo. Segmentos con 2px de separación del fondo, tooltip nativo
// por segmento y leyenda con valores (los colores claros necesitan etiqueta visible).
import { formatCOP, formatPct } from "@/domain/money";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: string;
}

export function Donut({ slices, total, centerLabel }: { slices: DonutSlice[]; total: number; centerLabel: string }) {
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0; // separación entre segmentos (px de arco)
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${formatCOP(total)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * c;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${s.label}: ${formatCOP(s.value)} (${formatPct(s.value / total, 0)})`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </g>
        <text x="50%" y="46%" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
          {centerLabel}
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="tabular fill-[var(--fg)] text-[17px] font-bold">
          {formatCOP(total)}
        </text>
      </svg>

      {/* Leyenda con valores: también sirve de vista de tabla */}
      <ul className="w-full flex-1 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2 py-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {s.icon} {s.label}
            </span>
            <span className="tabular font-semibold">{formatCOP(s.value)}</span>
            <span className="tabular muted w-10 text-right text-xs">{total > 0 ? formatPct(s.value / total, 0) : "—"}</span>
          </li>
        ))}
        {slices.length === 0 && <li className="muted py-2 text-center">Todavía no hay gastos identificados este mes.</li>}
      </ul>
    </div>
  );
}
