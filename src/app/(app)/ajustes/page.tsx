import { headers } from "next/headers";
import Link from "next/link";
import { GmailConnect } from "@/components/gmail-connect";
import { PageHeader } from "@/components/page-header";
import { PinSettings } from "@/components/pin-settings";
import { currentMonth } from "@/domain/dates";
import { alertsMasterSecret, deriveMemberKey } from "@/lib/hmac";
import {
  AccountsEditor,
  BudgetEditor,
  MemberEditor,
  RulesList,
  SignOutButton,
} from "@/components/settings";
import { formatPct } from "@/domain/money";
import { splitShares } from "@/domain/split";
import { categoryLabel } from "@/lib/categories";
import type { BudgetRowDb, RuleRow } from "@/lib/db-types";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const { supabase, me, members, partner, accounts, categories, allCategories, user } = await getHousehold();
  const monthStart = `${currentMonth()}-01`;
  const [budgets, rules, logs] = await Promise.all([
    supabase.from("budgets").select("*").eq("household_id", me.household_id).returns<BudgetRowDb[]>(),
    supabase.from("rules").select("*").eq("household_id", me.household_id).order("created_at", { ascending: false }).returns<RuleRow[]>(),
    supabase
      .from("ingest_log")
      .select("member_id, status, text, created_at")
      .eq("household_id", me.household_id)
      .gte("created_at", new Date(Date.now() - 45 * 864e5).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<{ member_id: string; status: string; text: string | null; created_at: string }[]>(),
  ]);

  // Conexión de Gmail: URL del webhook, clave personal (derivada) y estado de cada uno
  const h = await headers();
  const webhookUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/ingest/email`;
  const master = alertsMasterSecret();
  const secret = master && master.length >= 32 && process.env.SUPABASE_SERVICE_ROLE_KEY ? deriveMemberKey(master, me.id) : null;
  const logRows = logs.data ?? [];
  const gmailStatus = members.map((m) => {
    const mine = logRows.filter((l) => l.member_id === m.id);
    return {
      name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name,
      lastAt: mine[0]?.created_at ?? null,
      created: mine.filter((l) => l.status === "creado" && l.created_at >= monthStart).length,
      unknown: mine.filter((l) => l.status === "formato_desconocido").length,
    };
  });
  const unknownSamples = logRows
    .filter((l) => l.status === "formato_desconocido" && l.text)
    .slice(0, 10)
    .map((l) => ({ at: l.created_at, text: l.text! }));
  const shares = splitShares(members);
  const memberOpts = members.map((m) => ({ id: m.id, name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name }));
  const catById = new Map(allCategories.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-6 px-4 pb-8">
        <nav className="grid grid-cols-2 gap-3">
          <Link href="/ajustes/categorias" className="card flex flex-col gap-1 p-4">
            <span className="text-2xl" aria-hidden>🏷️</span>
            <span className="font-semibold">Categorías</span>
            <span className="muted text-xs">Crear, renombrar, mover y eliminar</span>
          </Link>
          <Link href="/ajustes/recurrentes" className="card flex flex-col gap-1 p-4">
            <span className="text-2xl" aria-hidden>🔁</span>
            <span className="font-semibold">Recurrentes</span>
            <span className="muted text-xs">Arriendo, empleada, suscripciones…</span>
          </Link>
          <Link href="/bolsillos" className="card col-span-2 flex items-center gap-3 p-4">
            <span className="text-2xl" aria-hidden>🐷</span>
            <span>
              <span className="block font-semibold">Bolsillos</span>
              <span className="muted text-xs">Viaje, imprevistos… y pasar el sobrante del mes</span>
            </span>
          </Link>
        </nav>

        <section id="pin">
          <h2 className="mb-1 font-semibold">Acceso con PIN</h2>
          <p className="muted mb-3 text-xs">
            Entran con su correo + un PIN de 4 números. Tras 5 intentos fallidos se bloquea 15 minutos (y cada bloqueo dura
            el doble). La sesión queda abierta en cada dispositivo.
          </p>
          <PinSettings
            myPinSet={!!me.pin_set_at}
            partner={
              partner
                ? { name: partner.display_name, email: partner.email, linked: !!partner.user_id, pinSet: !!partner.pin_set_at }
                : null
            }
          />
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Alertas del banco por correo</h2>
          <p className="muted mb-3 text-xs">
            Cada uno conecta su Gmail una vez. La app solo recibe las alertas de Bancolombia; nunca pide claves del banco.
          </p>
          <GmailConnect webhookUrl={webhookUrl} memberId={me.id} secret={secret} status={gmailStatus} unknownSamples={unknownSamples} />
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Ingresos y % de reparto</h2>
          <p className="muted mb-3 text-xs">
            Reparto actual: {members.map((m, i) => `${m.display_name} ${formatPct(shares[i].ratio)}`).join(" · ")}. Cámbienlo
            cuando a alguno le cambie el ingreso.
          </p>
          <div className="flex flex-col gap-3">
            {members.map((m) => (
              <MemberEditor key={m.id} member={m} linked={!!m.user_id} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Cuentas y medios de pago</h2>
          <AccountsEditor accounts={accounts} members={memberOpts} />
        </section>

        <section id="presupuesto">
          <h2 className="mb-1 font-semibold">Presupuesto mensual</h2>
          <p className="muted mb-3 text-xs">
            “Fijo” es un monto. “Resto” toma un % de lo que sobra del ingreso después de los fijos (así calculaba el Excel
            el ahorro).
          </p>
          <BudgetEditor categories={categories} budgets={budgets.data ?? []} members={memberOpts} />
          <Link href="/ajustes/categorias" className="mt-3 block text-center text-sm font-medium text-[var(--color-brand)]">
            Crear o editar categorías →
          </Link>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Reglas automáticas</h2>
          <p className="muted mb-3 text-xs">
            “Automática”: las alertas de ese comercio entran ya clasificadas. “Sugerencia”: van a Pendientes con la
            sugerencia lista para aceptar.
          </p>
          <RulesList rules={(rules.data ?? []).map((r) => ({ ...r, categoryName: r.category_id ? categoryLabel(r.category_id, catById) : null }))} />
        </section>

        <section className="flex flex-col items-center gap-2">
          <p className="muted text-xs">Sesión: {user.email}</p>
          <SignOutButton />
        </section>
      </div>
    </>
  );
}
