import Link from "next/link";
import { monthLabel, shiftMonth } from "@/domain/dates";

export function PageHeader({
  title,
  month,
  basePath,
  right,
}: {
  title: string;
  month?: string;
  basePath?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg)]/95 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{title}</h1>
        {month && basePath && (
          <div className="muted mt-0.5 flex items-center gap-2 text-sm">
            <Link href={`${basePath}?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="px-1">‹</Link>
            <span className="capitalize">{monthLabel(month)}</span>
            <Link href={`${basePath}?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="px-1">›</Link>
          </div>
        )}
      </div>
      {right}
      <Link href="/ajustes" aria-label="Ajustes" className="btn btn-ghost !min-h-10 !px-3">⚙️</Link>
    </header>
  );
}
