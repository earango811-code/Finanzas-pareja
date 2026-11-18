import Link from "next/link";
import { formatCOP, formatPct } from "@/domain/money";
import type { PersonalAvailable } from "@/domain/month-close";

/** "Disponible para mí": ingreso − mi parte de lo gastado en lo compartido − mis gastos personales. */
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
        <dt className="muted">− Mi parte de lo gastado en compartido ({formatPct(data.ratio)})</dt>
        <dd className="text-right">{formatCOP(data.sharedNow)}</dd>
        <dt className="muted">− Mis gastos personales</dt>
        <dd className="text-right">{formatCOP(data.personalSpent)}</dd>
      </dl>
      {data.sharedPlanned > data.sharedNow && (
        <p className="muted mt-2 text-xs">
          Si se gasta todo el presupuesto compartido del mes, mi parte sería {formatCOP(data.sharedPlanned)} y me quedarían{" "}
          {formatCOP(data.availableIfBudgetSpent)}.
        </p>
      )}
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
