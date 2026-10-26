import Link from "next/link";
import { monthLabel, shiftMonth } from "@/domain/dates";

/** Encabezado grande (estilo Buddy) con selector de mes y botón de volver opcionales. */
export function PageHeader({
  title,
  month,
  basePath,
  right,
  backHref,
}: {
  title: string;
  month?: string;
  basePath?: string;
  right?: React.ReactNode;
  backHref?: string;
}) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--bg)]/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex items-center gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Volver"
            className="card flex h-10 w-10 shrink-0 items-center justify-center !rounded-full text-xl"
          >
            ‹
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {right}
      </div>
      {month && basePath && (
        <div className="mt-2 flex items-center gap-1 text-sm">
          <Link href={`${basePath}?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="card flex h-8 w-8 items-center justify-center !rounded-full">
            ‹
          </Link>
          <span className="min-w-28 text-center font-semibold capitalize">{monthLabel(month)}</span>
          <Link href={`${basePath}?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="card flex h-8 w-8 items-center justify-center !rounded-full">
            ›
          </Link>
        </div>
      )}
    </header>
  );
}
