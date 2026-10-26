"use client";

// Barra inferior flotante en forma de píldora (estilo Buddy) con el botón "+" al centro.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inicio", label: "Vista general", icon: "◉", match: ["/inicio", "/balance", "/movimientos"] },
  { href: "/pendientes", label: "Pendientes", icon: "📥", match: ["/pendientes"] },
  { href: "/nuevo", label: "Registrar", icon: "+", primary: true, match: ["/nuevo"] },
  { href: "/presupuesto", label: "Presupuesto", icon: "◔", match: ["/presupuesto", "/bolsillos"] },
  { href: "/mas", label: "Herramientas", icon: "🧰", match: ["/mas", "/ajustes"] },
];

export function BottomNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <ul className="card pointer-events-auto mx-auto flex max-w-md items-center justify-between rounded-full px-2 py-1.5 backdrop-blur">
        {TABS.map((t) => {
          const active = t.match.some((m) => path.startsWith(m));
          if (t.primary) {
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-label={t.label}
                  className="mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand)] text-3xl font-light leading-none text-white shadow-lg"
                >
                  +
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`relative flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10.5px] font-medium ${
                  active ? "bg-[var(--bg)] text-[var(--color-brand)]" : "muted"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
                {t.href === "/pendientes" && pending > 0 && (
                  <span className="absolute right-[18%] top-0 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold text-white">
                    {pending > 99 ? "99+" : pending}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
