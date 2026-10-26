import Link from "next/link";
import { CatIcon } from "@/components/cat-icon";
import { Donut, type DonutSlice } from "@/components/donut";
import { PageHeader } from "@/components/page-header";
import { buildBudgetRows, rootCategoryId } from "@/domain/budget";
import { defaultMonth, isValidMonth, shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { computeSettlement } from "@/domain/split";
import { netIncome } from "@/domain/types";
import { TX_COLUMNS, type TransactionRow } from "@/lib/db-types";
import { getHousehold, memberName } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";
import { visualFor } from "@/lib/visual";

export const metadata = { title: "Vista general" };

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const ctx = await getHousehold();
  const { supabase, me, members, household, allCategories, categories } = ctx;
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth(household.start_month);

  const [{ txs, budgets, pendingCount }, recentRes, pendingAll] = await Promise.all([
    loadMonth(ctx, month),
    supabase
      .from("transactions")
      .select(TX_COLUMNS)
      .eq("household_id", me.household_id)
      .eq("status", "identificado")
      .eq("month", month)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6)
      .returns<TransactionRow[]>(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("household_id", me.household_id).eq("status", "pendiente"),
  ]);

  // Gasto e ingresos del mes (de los dos, compartido y personal)
  const byId = new Map(allCategories.map((c) => [c.id, c]));
  const spentByGroup = new Map<string, number>();
  let expenses = 0;
  let income = 0;
  for (const t of txs) {
    if (t.kind === "gasto") {
      expenses += t.amount;
      const g = t.category_id ? rootCategoryId(t.category_id, byId) : "sin";
      spentByGroup.set(g, (spentByGroup.get(g) ?? 0) + t.amount);
    } else if (t.kind === "ingreso") {
      const root = t.category_id ? byId.get(rootCategoryId(t.category_id, byId)) : undefined;
      if (!t.category_id || root?.is_income) income += t.amount;
      else {
        // devolución: resta del gasto de su grupo
        expenses -= t.amount;
        const g = rootCategoryId(t.category_id, byId);
        spentByGroup.set(g, (spentByGroup.get(g) ?? 0) - t.amount);
      }
    }
  }
  const slices: DonutSlice[] = [...spentByGroup.entries()]
    .filter(([, v]) => v > 0)
    .map(([g, v]) => {
      const cat = byId.get(g);
      const vis = visualFor(cat ? g : null, allCategories);
      return { key: g, label: cat?.name ?? "Sin grupo", value: v, color: vis.color, icon: vis.icon };
    })
    .sort((a, b) => (byId.get(a.key)?.sort_order ?? 999) - (byId.get(b.key)?.sort_order ?? 999));

  // Lo que queda para gastar (presupuesto compartido, sin Ahorro)
  const totalIncome = members.reduce((a, m) => a + netIncome(m), 0);
  const rows = buildBudgetRows({ lines: budgets, categories, txs, incomeBase: totalIncome, memberId: null }).filter((r) => r.group !== "ahorro");
  const budgeted = rows.reduce((a, r) => a + r.budgeted, 0);
  const spentBudget = rows.reduce((a, r) => a + r.spent, 0);
  const left = budgeted - spentBudget;
  const usedRatio = budgeted > 0 ? spentBudget / budgeted : 0;

  const settlement = computeSettlement(members, txs);
  const maxBar = Math.max(income, expenses, 1);
  const recent = recentRes.data ?? [];

  return (
    <>
      <PageHeader title="Vista general" month={month} basePath="/inicio" />
      <div className="flex flex-col gap-4 px-4 pb-4">
        {(pendingAll.count ?? 0) > 0 && (
          <Link href="/pendientes" className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-xl" aria-hidden>
              📥
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{pendingAll.count} por identificar</span>
              <span className="muted text-xs">{pendingCount ? `${pendingCount} de este mes` : "Toca para clasificarlos"}</span>
            </span>
            <span className="muted">›</span>
          </Link>
        )}

        {/* Queda para gastar */}
        <Link href="/presupuesto" className="card block p-4">
          <p className="muted text-sm">Nos queda para gastar</p>
          <p className={`tabular mt-1 text-3xl font-bold ${left < 0 ? "text-red-600" : ""}`}>{formatCOP(left)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className={`h-full rounded-full ${usedRatio >= 1 ? "bg-red-500" : usedRatio >= 0.8 ? "bg-amber-500" : "bg-[var(--color-brand)]"}`}
              style={{ width: `${Math.min(100, usedRatio * 100)}%` }}
            />
          </div>
          <p className="muted mt-1 text-xs">
            {formatCOP(spentBudget)} de {formatCOP(budgeted)} del presupuesto compartido
          </p>
        </Link>

        {/* Gasto por grupo */}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Gastos por grupo</h2>
          <Donut slices={slices} total={Math.max(0, expenses)} centerLabel="Gastado" />
        </section>

        {/* Ingresos vs gastos: una sola escala */}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Ingresos y gastos</h2>
          {[
            { label: "Ingresos", value: income, color: "var(--g-ingresos)" },
            { label: "Gastos", value: Math.max(0, expenses), color: "var(--g-salidas)" },
          ].map((b) => (
            <div key={b.label} className="mb-3 last:mb-0">
              <div className="flex justify-between text-sm">
                <span>{b.label}</span>
                <span className="tabular font-semibold">{formatCOP(b.value)}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-[var(--line)]" title={`${b.label}: ${formatCOP(b.value)}`}>
                <div className="h-full rounded-r" style={{ width: `${(b.value / maxBar) * 100}%`, background: b.color }} />
              </div>
            </div>
          ))}
          <p className="muted mt-2 text-xs">Ingresos registrados en la app (salario, prestaciones…) y gastos identificados del mes.</p>
        </section>

        {/* Quién le debe a quién */}
        <Link href={`/balance?mes=${month}`} className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg)] text-xl" aria-hidden>
            ⚖️
          </span>
          <span className="flex-1">
            {settlement.transfer ? (
              <>
                <span className="block font-semibold">
                  {memberName(ctx, settlement.transfer.from)} le debe {formatCOP(settlement.transfer.amount)}
                </span>
                <span className="muted text-xs">a {memberName(ctx, settlement.transfer.to)} · gastos compartidos del mes</span>
              </>
            ) : (
              <>
                <span className="block font-semibold">A paz y salvo</span>
                <span className="muted text-xs">Nadie le debe a nadie este mes</span>
              </>
            )}
          </span>
          <span className="muted">›</span>
        </Link>

        {/* Últimos movimientos */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-semibold">Últimos movimientos</h2>
            <Link href={`/movimientos?mes=${month}`} className="text-sm font-medium text-[var(--color-brand)]">
              Ver todos
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted px-4 py-6 text-center text-sm">Aún no hay movimientos identificados este mes.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {recent.map((t) => {
                const vis = visualFor(t.category_id, allCategories);
                const cat = t.category_id ? byId.get(t.category_id) : undefined;
                return (
                  <li key={t.id}>
                    <Link href={`/movimientos/${t.id}?volver=/inicio`} className="list-row">
                    <CatIcon visual={vis} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{cat?.name ?? t.merchant ?? "Movimiento"}</p>
                      <p className="muted truncate text-xs">
                        {shortDate(t.occurred_on)} · {memberName(ctx, t.paid_by_member_id)}
                        {t.scope === "compartido" ? " · 🏠" : t.scope === "personal" ? " · 👤" : ""}
                      </p>
                    </div>
                    <span className={`tabular text-sm font-semibold ${t.kind === "ingreso" ? "text-emerald-600" : ""}`}>
                      {t.kind === "ingreso" ? "+" : "−"}
                      {formatCOP(t.amount)}
                    </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
