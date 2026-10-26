import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/settings";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Herramientas" };

const SECTIONS: { title: string; items: { href: string; icon: string; color: string; label: string; hint: string }[] }[] = [
  {
    title: "Dinero",
    items: [
      { href: "/movimientos", icon: "📄", color: "var(--g-comida)", label: "Movimientos", hint: "Todo lo identificado, por mes" },
      { href: "/balance", icon: "⚖️", color: "var(--g-transporte)", label: "Quién le debe a quién", hint: "Reparto de los gastos compartidos" },
      { href: "/bolsillos", icon: "🐷", color: "var(--g-ahorros)", label: "Bolsillos", hint: "Viaje, imprevistos… y el sobrante del mes" },
      { href: "/ajustes/recurrentes", icon: "🔁", color: "var(--g-casa)", label: "Recurrentes", hint: "Arriendo, empleada, suscripciones" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/ajustes/categorias", icon: "🏷️", color: "var(--g-salidas)", label: "Grupos y categorías", hint: "Crear, renombrar, mover" },
      { href: "/ajustes#presupuesto", icon: "◔", color: "var(--g-comida)", label: "Presupuesto por grupo", hint: "Montos de cada grupo" },
      { href: "/ajustes#cuentas", icon: "💳", color: "var(--g-transporte)", label: "Cuentas y tarjetas", hint: "Últimos 4 dígitos de cada una" },
      { href: "/ajustes#pin", icon: "🔑", color: "var(--g-casa)", label: "Ingresos, PIN y Gmail", hint: "Reparto, acceso y alertas del banco" },
    ],
  },
];

export default async function MasPage() {
  const { user } = await getHousehold();
  return (
    <>
      <PageHeader title="Herramientas" />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="muted mb-2 px-1 text-xs font-semibold uppercase tracking-wide">{s.title}</h2>
            <ul className="card overflow-hidden">
              {s.items.map((it) => (
                <li key={it.href} className="list-row !p-0">
                  <Link href={it.href} className="flex w-full items-center gap-3 px-4 py-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white"
                      style={{ background: it.color }}
                      aria-hidden
                    >
                      {it.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{it.label}</span>
                      <span className="muted block truncate text-xs">{it.hint}</span>
                    </span>
                    <span className="muted">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="muted text-xs">Sesión: {user.email}</p>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
