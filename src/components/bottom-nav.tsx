"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/pendientes", label: "Pendientes", icon: "📥" },
  { href: "/movimientos", label: "Movimientos", icon: "📄" },
  { href: "/nuevo", label: "Registrar", icon: "➕", primary: true },
  { href: "/presupuesto", label: "Presupuesto", icon: "📊" },
  { href: "/balance", label: "Balance", icon: "⚖️" },
];

export function BottomNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-[var(--color-brand)]" : "muted"}`}
              >
                <span
                  className={`text-xl leading-none ${t.primary ? "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-brand)] text-white" : ""}`}
                  aria-hidden
                >
                  {t.primary ? "+" : t.icon}
                </span>
                {t.label}
                {t.href === "/pendientes" && pending > 0 && (
                  <span className="absolute right-[22%] top-1 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold text-white">
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
