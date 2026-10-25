import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { buildBudgetRows, summarizeGroups, type BudgetRow } from "@/domain/budget";
import { currentMonth, defaultMonth, isValidMonth, monthLabel } from "@/domain/dates";
import { formatCOP, formatPct } from "@/domain/money";
import { BUDGET_GROUP_LABEL, netIncome } from "@/domain/types";
import { getHousehold } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";

export const metadata = { title: "Presupuesto" };

const BAR: Record<BudgetRow["alert"], string> = {
  ok: "bg-emerald-500",
  alerta: "bg-amber-500",
  excedido: "bg-red-500",
};

export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth((await getHousehold()).household.start_month);
  const ctx = await getHousehold();
  const { me, members, household, categories } = ctx;
  const view = members.some((m) => m.id === sp.vista) ? sp.vista! : "compartido";
  const memberId = view === "compartido" ? null : view;
  const { txs, budgets, pendingCount } = await loadMonth(ctx, month);

  const incomeBase =
    memberId === null
      ? members.reduce((a, m) => a + netIncome(m), 0)
      : netIncome(members.find((m) => m.id === memberId)!);

  const rows = buildBudgetRows({ lines: budgets, categories, txs, incomeBase, memberId });
  const groups = summarizeGroups(rows, incomeBase, {
    necesidades: Number(household.target_needs),
    deseos: Number(household.target_wants),
    ahorro: Number(household.target_savings),
  });
  // "Para gastar" = Necesidades + Deseos. El ahorro no es plata para gastar.
  const spendRows = rows.filter((r) => r.group !== "ahorro");
  const totalBudget = spendRows.reduce((a, r) => a + r.budgeted, 0);
  const totalSpent = spendRows.reduce((a, r) => a + r.spent, 0);
  const available = totalBudget - totalSpent;
  const usedRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const savingsBudget = rows.filter((r) => r.group === "ahorro").reduce((a, r) => a + r.budgeted, 0);
  const viewLabel = memberId === null ? "Nos queda para gastar" : memberId === me.id ? "Me queda para gastar" : `Le queda a ${members.find((m) => m.id === memberId)!.display_name}`;
  const alerts = rows.filter((r) => r.alert !== "ok" && r.budgeted > 0);

  // Desglose por subcategoría dentro de cada categoría principal
  const catById = new Map(categories.map((c) => [c.id, c]));
  const breakdown = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (t.kind !== "gasto" || !t.category_id) continue;
    const inScope = memberId === null ? t.scope === "compartido" : t.scope === "personal" && t.paid_by_member_id === memberId;
    const c = catById.get(t.category_id);
    if (!inScope || !c?.parent_id) continue;
    const sub = breakdown.get(c.parent_id) ?? new Map<string, number>();
    sub.set(c.name, (sub.get(c.name) ?? 0) + t.amount);
    breakdown.set(c.parent_id, sub);
  }

  const tabs = [
    { key: "compartido", label: "🏠 Compartido" },
    ...members.map((m) => ({ key: m.id, label: m.id === me.id ? "👤 Yo" : `👤 ${m.display_name}` })),
  ];

  return (
    <>
      <PageHeader
        title="Presupuesto"
        month={month}
        basePath={`/presupuesto`}
        right={
          <Link href="/bolsillos" className="btn btn-ghost !min-h-10 !px-3 text-sm" aria-label="Bolsillos">
            🐷 Bolsillos
          </Link>
        }
      />
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {tabs.map((t) => (
          <Link key={t.key} href={`/presupuesto?mes=${month}&vista=${t.key}`} className="chip shrink-0" data-active={view === t.key}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4">
        {household.start_month && month < household.start_month && (
          <Link
            href={`/presupuesto?mes=${household.start_month}`}
            className="card block border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
          >
            Empezaron a usar la app en <span className="capitalize">{monthLabel(household.start_month)}</span>: este mes es
            anterior y no se lleva presupuesto. Ver <span className="capitalize">{monthLabel(household.start_month)}</span> →
          </Link>
        )}
        {pendingCount > 0 && (
          <Link href="/pendientes" className="card block border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Hay {pendingCount} pendientes este mes que todavía no cuentan aquí →
          </Link>
        )}

        <section className="card p-4">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="muted text-xs">Presupuesto para gastar</p>
              <p className="tabular font-bold">{formatCOP(totalBudget)}</p>
            </div>
            <div>
              <p className="muted text-xs">Gastado (real)</p>
              <p className="tabular font-bold">{formatCOP(totalSpent)}</p>
            </div>
          </div>
          {savingsBudget > 0 && (
            <p className="muted mt-2 text-center text-xs">Ahorro presupuestado aparte: {formatCOP(savingsBudget)}</p>
          )}
        </section>

        {alerts.length > 0 && (
          <section className="flex flex-col gap-1">
            {alerts.map((r) => (
              <p key={r.categoryId} className={`rounded-lg px-3 py-2 text-sm ${r.alert === "excedido" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                {r.alert === "excedido" ? "🔴" : "🟠"} <b>{r.name}</b> va en {formatPct(r.ratio, 0)} del presupuesto
              </p>
            ))}
          </section>
        )}

        {(["necesidades", "deseos", "ahorro"] as const).map((g) => {
          const list = rows.filter((r) => r.group === g);
          if (list.length === 0) return null;
          return (
            <section key={g} className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">{BUDGET_GROUP_LABEL[g]}</h2>
              <ul className="flex flex-col gap-3">
                {list.map((r) => (
                  <li key={r.categoryId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{r.name}</span>
                      <span className="tabular muted shrink-0 text-xs">
                        <b className="text-[var(--fg)]">{formatCOP(r.spent)}</b> / {formatCOP(r.budgeted)}
                        {r.budgeted > 0 && ` · ${formatPct(r.ratio, 0)}`}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                      <div className={`h-full ${BAR[r.alert]}`} style={{ width: `${Math.min(100, (Number.isFinite(r.ratio) ? r.ratio : 1) * 100)}%` }} />
                    </div>
                    {breakdown.has(r.categoryId) && (
                      <p className="muted mt-1 text-xs">
                        {[...breakdown.get(r.categoryId)!]
                          .sort((a, b) => b[1] - a[1])
                          .map(([name, v]) => `${name} ${formatCOP(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Resumen 50/30/20</h2>
          <p className="muted mb-3 text-xs">Sobre un ingreso de {formatCOP(incomeBase)}</p>
          <table className="tabular w-full text-sm">
            <thead className="muted text-left text-xs">
              <tr>
                <th className="pb-1 font-normal">Grupo</th>
                <th className="pb-1 text-right font-normal">Meta</th>
                <th className="pb-1 text-right font-normal">Presup.</th>
                <th className="pb-1 text-right font-normal">Real</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.group} className="border-t border-[var(--line)]">
                  <td className="py-1.5">{BUDGET_GROUP_LABEL[g.group]}</td>
                  <td className="text-right">{formatPct(g.target, 0)}</td>
                  <td className="text-right">{formatPct(g.budgetedRatio)}</td>
                  <td className={`text-right ${g.group !== "ahorro" && g.spentRatio > g.target ? "text-red-600" : ""}`}>{formatPct(g.spentRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Link href="/ajustes#presupuesto" className="muted text-center text-sm underline">
          Editar montos del presupuesto
        </Link>
        {/* Espacio para que la barra fija no tape el final de la página */}
        <div className="h-16" aria-hidden />
      </div>

      {/* Siempre visible, justo encima de la barra de navegación */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-3">
        <div className="card mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5 shadow-lg">
          <div className="min-w-0 flex-1">
            <p className="muted truncate text-xs">{viewLabel}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className={`h-full ${usedRatio >= 1 ? "bg-red-500" : usedRatio >= 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, usedRatio * 100)}%` }}
              />
            </div>
          </div>
          <p className={`tabular shrink-0 text-xl font-bold ${available < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatCOP(available)}
          </p>
        </div>
      </div>
    </>
  );
}
