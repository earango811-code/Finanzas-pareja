import Link from "next/link";
import { formatCOP, formatPct } from "@/domain/money";
import type { PersonalAvailable } from "@/domain/month-close";

/** "Disponible para mí": ingreso − su parte de lo compartido − sus gastos personales. */
export function PersonalAvailableCard({ data, title, href }: { data: PersonalAvailable; title: string; href?: string }) {
  const body = (
    <>
      <p className="muted text-sm">{title}</p>
      <p className={`tabular mt-1 text-3xl font-bold ${data.available < 0 ? "text-red-600" : "text-[var(--color-brand)]"}`}>
        {formatCOP(data.available)}
      </p>
      <dl className="tabular mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="muted">Ingreso del mes</dt>
        <dd className="text-right">{formatCOP(data.income)}</dd>
        <dt className="muted">− Mi parte de lo compartido ({formatPct(data.ratio)})</dt>
        <dd className="text-right">{formatCOP(data.sharedPlanned)}</dd>
        <dt className="muted">− Mis gastos personales</dt>
        <dd className="text-right">{formatCOP(data.personalSpent)}</dd>
      </dl>
      <p className="muted mt-2 text-xs">
        Mi parte del presupuesto compartido ya queda reservada (de eso van gastados {formatCOP(data.sharedNow)}). Contando solo lo
        gastado hasta hoy, tendría {formatCOP(data.availableNow)}.
      </p>
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4">
      {body}
    </Link>
  ) : (
    <section className="card p-4">{body}</section>
  );
}
