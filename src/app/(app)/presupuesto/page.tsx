import Link from "next/link";
import { CatIcon } from "@/components/cat-icon";
import { PageHeader } from "@/components/page-header";
import { budgetCoverage, buildBudgetRows, summarizeGroups, type BudgetRow } from "@/domain/budget";
import { defaultMonth, isValidMonth, monthLabel } from "@/domain/dates";
import { formatCOP, formatPct } from "@/domain/money";
import { BUDGET_GROUP_LABEL, netIncome } from "@/domain/types";
import { getHousehold } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";
import { visualFor } from "@/lib/visual";

export const metadata = { title: "Presupuesto" };

type Tab = "restante" | "plan" | "analisis";

/** Anillo de progreso (como la pestaña "Restante" de Buddy). */
function Ring({ ratio, color, size = 44 }: { ratio: number; color: string; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 1));
  const over = ratio >= 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? "#dc2626" : color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${shown * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="54%" textAnchor="middle" className="tabular fill-[var(--fg)] text-[10px] font-semibold">
        {Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : "—"}
      </text>
    </svg>
  );
}

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; vista?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getHousehold();
  const { me, members, household, categories, allCategories } = ctx;
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth(household.start_month);
  const tab: Tab = sp.tab === "plan" || sp.tab === "analisis" ? sp.tab : "restante";
  const view = members.some((m) => m.id === sp.vista) ? sp.vista! : "compartido";
  const memberId = view === "compartido" ? null : view;
  const [{ txs, budgets, pendingCount }, { data: pocketData }] = await Promise.all([
    loadMonth(ctx, month),
    ctx.supabase.from("pockets").select("id, name").eq("household_id", me.household_id).returns<{ id: string; name: string }[]>(),
  ]);
  const pocketName = new Map((pocketData ?? []).map((p) => [p.id, p.name]));

  const incomeBase =
    memberId === null ? members.reduce((a, m) => a + netIncome(m), 0) : netIncome(members.find((m) => m.id === memberId)!);

  const rows = buildBudgetRows({ lines: budgets, categories, txs, incomeBase, memberId });
  const summary = summarizeGroups(rows, incomeBase, {
    necesidades: Number(household.target_needs),
    deseos: Number(household.target_wants),
    ahorro: Number(household.target_savings),
  });
  // "Para gastar" = sin el grupo de Ahorro
  const spendRows = rows.filter((r) => r.group !== "ahorro");
  const totalBudget = spendRows.reduce((a, r) => a + r.budgeted, 0);
  const totalSpent = spendRows.reduce((a, r) => a + r.spent, 0);
  const available = totalBudget - totalSpent;
  const usedRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const viewLabel =
    memberId === null ? "Nos queda para gastar" : memberId === me.id ? "Me queda para gastar" : `Le queda a ${members.find((m) => m.id === memberId)!.display_name}`;

  // Detalle por categoría dentro de cada grupo
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const breakdown = new Map<string, { id: string; name: string; amount: number }[]>();
  for (const t of txs) {
    if (t.kind !== "gasto" || !t.category_id || t.pocket_id) continue;
    const inScope = memberId === null ? t.scope === "compartido" : t.scope === "personal" && t.paid_by_member_id === memberId;
    const c = catById.get(t.category_id);
    if (!inScope || !c?.parent_id) continue;
    const list = breakdown.get(c.parent_id) ?? [];
    const item = list.find((x) => x.id === c.id);
    if (item) item.amount += t.amount;
    else list.push({ id: c.id, name: c.name, amount: t.amount });
    breakdown.set(c.parent_id, list);
  }

  const coverage = budgetCoverage(rows, incomeBase);
  // Plan: todos los grupos de gasto (con o sin monto), los de ahorro al final
  const budgetedById = new Map(rows.map((r) => [r.categoryId, r.budgeted]));
  const planGroups = categories
    .filter((c) => !c.parent_id && !c.is_income)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ ...c, budgeted: budgetedById.get(c.id) ?? 0 }));
  const planSpend = planGroups.filter((g) => g.budget_group !== "ahorro");
  const planSave = planGroups.filter((g) => g.budget_group === "ahorro");

  const sortRows = (a: BudgetRow, b: BudgetRow) => (catById.get(a.categoryId)?.sort_order ?? 999) - (catById.get(b.categoryId)?.sort_order ?? 999);
  const ordered = [...rows].sort(sortRows);
  const q = (t: Tab) => `/presupuesto?mes=${month}&vista=${view}&tab=${t}`;
  const scopes = [
    { key: "compartido", label: "🏠 Compartido" },
    ...members.map((m) => ({ key: m.id, label: m.id === me.id ? "👤 Yo" : `👤 ${m.display_name}` })),
  ];

  return (
    <>
      <PageHeader
        title="Presupuesto"
        month={month}
        basePath="/presupuesto"
        right={
          <Link href="/bolsillos" className="btn btn-ghost !min-h-10 !px-3 text-sm">
            🐷 Bolsillos
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-28">
        <div className="flex gap-2 overflow-x-auto">
          {scopes.map((s) => (
            <Link key={s.key} href={`/presupuesto?mes=${month}&vista=${s.key}&tab=${tab}`} className="chip shrink-0" data-active={view === s.key}>
              {s.label}
            </Link>
          ))}
        </div>

        <nav className="segmented" aria-label="Vista del presupuesto">
          <Link href={q("restante")} data-active={tab === "restante"}>Restante</Link>
          <Link href={q("plan")} data-active={tab === "plan"}>Plan</Link>
          <Link href={q("analisis")} data-active={tab === "analisis"}>Análisis</Link>
        </nav>

        {household.start_month && month < household.start_month && (
          <Link href={`/presupuesto?mes=${household.start_month}`} className="card block border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Empezaron a usar la app en <span className="capitalize">{monthLabel(household.start_month)}</span>: este mes es anterior y no se
            lleva presupuesto. Ver <span className="capitalize">{monthLabel(household.start_month)}</span> →
          </Link>
        )}
        {pendingCount > 0 && (
          <Link href="/pendientes" className="card block border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Hay {pendingCount} pendientes de este mes que todavía no cuentan aquí →
          </Link>
        )}

        {tab === "restante" && (
          <>
          <ul className="card overflow-hidden">
            {ordered.filter((r) => r.group !== "ahorro").map((r) => {
              const vis = visualFor(r.categoryId, allCategories);
              const left = r.budgeted - r.spent;
              const subs = (breakdown.get(r.categoryId) ?? []).sort((a, b) => b.amount - a.amount);
              return (
                <li key={r.categoryId} className="list-row !block !p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <CatIcon visual={vis} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className={`tabular block text-xs ${left < 0 ? "text-red-600" : "muted"}`}>
                          {r.budgeted > 0
                            ? left >= 0
                              ? `Quedan ${formatCOP(left)} de ${formatCOP(r.budgeted)}`
                              : `Pasado por ${formatCOP(-left)} de ${formatCOP(r.budgeted)}`
                            : `Gastado ${formatCOP(r.spent)} · sin presupuesto`}
                        </span>
                      </span>
                      <Ring ratio={r.budgeted > 0 ? r.spent / r.budgeted : r.spent > 0 ? Infinity : 0} color={vis.color} />
                    </summary>
                    {subs.length > 0 && (
                      <ul className="border-t border-[var(--line)] bg-[var(--bg)] px-4 py-2">
                        {subs.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                            <CatIcon visual={visualFor(s.id, allCategories)} size={24} />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="tabular font-medium">{formatCOP(s.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
            {ordered.length === 0 && <li className="muted list-row justify-center text-sm">No hay presupuesto para esta vista.</li>}
          </ul>
          {ordered.some((r) => r.group === "ahorro") && (
            <>
              <h2 className="muted -mb-2 px-1 text-xs font-semibold uppercase tracking-wide">Ahorro · no cuenta en lo que queda para gastar</h2>
              <ul className="card overflow-hidden">
                {ordered
                  .filter((r) => r.group === "ahorro")
                  .map((r) => {
                    const vis = visualFor(r.categoryId, allCategories);
                    const g = catById.get(r.categoryId);
                    return (
                      <li key={r.categoryId} className="list-row">
                        <CatIcon visual={vis} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="muted block text-xs">
                            {g?.pocket_id ? `A fin de mes → 🐷 ${pocketName.get(g.pocket_id) ?? "bolsillo"}` : "Ahorro"}
                            {r.spent > 0 && ` · usado ${formatCOP(r.spent)}`}
                          </span>
                        </span>
                        <span className="tabular font-semibold">{formatCOP(r.budgeted - r.spent)}</span>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
          </>
        )}

        {tab === "plan" && (
          <>
            <section className="card flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{memberId === null ? "Ingresos de los dos" : "Ingreso"}</h2>
                <span className="tabular font-bold">{formatCOP(coverage.income)}</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--line)]" role="img" aria-label={`Asignado ${formatPct(coverage.ratio, 0)} del ingreso`}>
                <div className="h-full bg-[var(--color-brand)]" style={{ width: `${coverage.income > 0 ? Math.min(100, (coverage.spending / coverage.income) * 100) : 0}%` }} />
                <div className="h-full border-l-2 border-[var(--card)] bg-[var(--g-ahorros)]" style={{ width: `${coverage.income > 0 ? Math.min(100, (coverage.saving / coverage.income) * 100) : 0}%` }} />
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 text-xs">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--color-brand)]" />Gastos {formatCOP(coverage.spending)}</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--g-ahorros)]" />Ahorro {formatCOP(coverage.saving)}</span>
              </div>
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  coverage.unassigned === 0 ? "bg-emerald-50 text-emerald-800" : coverage.unassigned > 0 ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"
                }`}
              >
                {coverage.unassigned === 0
                  ? "✓ El presupuesto cubre el 100 % del ingreso."
                  : coverage.unassigned > 0
                    ? `Faltan ${formatCOP(coverage.unassigned)} por asignar (${formatPct(coverage.ratio, 0)} asignado).`
                    : `El presupuesto se pasa del ingreso por ${formatCOP(-coverage.unassigned)}.`}
              </p>
            </section>

            <ul className="card overflow-hidden">
              {planSpend.map((g) => (
                <li key={g.id} className="list-row">
                  <CatIcon visual={visualFor(g.id, allCategories)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="muted text-xs">{BUDGET_GROUP_LABEL[g.budget_group!]}</span>
                  </span>
                  <span className={`tabular ${g.budgeted > 0 ? "font-semibold" : "muted text-xs"}`}>{g.budgeted > 0 ? formatCOP(g.budgeted) : "Sin asignar"}</span>
                </li>
              ))}
              <li className="list-row">
                <span className="flex-1 font-semibold">Total para gastar</span>
                <span className="tabular font-bold">{formatCOP(coverage.spending)}</span>
              </li>
            </ul>

            <ul className="card overflow-hidden">
              {planSave.map((g) => (
                <li key={g.id} className="list-row">
                  <CatIcon visual={visualFor(g.id, allCategories)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="muted text-xs">
                      {g.pocket_id ? `A fin de mes, lo que sobre → 🐷 ${pocketName.get(g.pocket_id) ?? "bolsillo"}` : "Ahorro"}
                    </span>
                  </span>
                  <span className={`tabular ${g.budgeted > 0 ? "font-semibold" : "muted text-xs"}`}>{g.budgeted > 0 ? formatCOP(g.budgeted) : "Sin asignar"}</span>
                </li>
              ))}
              <li className="list-row">
                <span className="flex-1 font-semibold">Total ahorro</span>
                <span className="tabular font-bold">{formatCOP(coverage.saving)}</span>
              </li>
            </ul>
            <Link href="/ajustes/presupuesto" className="btn btn-ghost">
              Editar montos por grupo
            </Link>
          </>
        )}

        {tab === "analisis" && (
          <section className="card p-4">
            <h2 className="font-semibold">Regla 50/30/20</h2>
            <p className="muted mb-3 text-xs">Sobre un ingreso de {formatCOP(incomeBase)}</p>
            <table className="tabular w-full text-sm">
              <thead className="muted text-left text-xs">
                <tr>
                  <th className="pb-1 font-normal">Tipo</th>
                  <th className="pb-1 text-right font-normal">Meta</th>
                  <th className="pb-1 text-right font-normal">Plan</th>
                  <th className="pb-1 text-right font-normal">Real</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((g) => (
                  <tr key={g.group} className="border-t border-[var(--line)]">
                    <td className="py-2">{BUDGET_GROUP_LABEL[g.group]}</td>
                    <td className="text-right">{formatPct(g.target, 0)}</td>
                    <td className="text-right">{formatPct(g.budgetedRatio)}</td>
                    <td className={`text-right ${g.group !== "ahorro" && g.spentRatio > g.target ? "text-red-600" : ""}`}>{formatPct(g.spentRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.some((r) => r.alert !== "ok" && r.budgeted > 0) && (
              <div className="mt-4 flex flex-col gap-1">
                {rows
                  .filter((r) => r.alert !== "ok" && r.budgeted > 0)
                  .map((r) => (
                    <p key={r.categoryId} className={`rounded-lg px-3 py-2 text-sm ${r.alert === "excedido" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                      {r.alert === "excedido" ? "🔴" : "🟠"} <b>{r.name}</b> va en {formatPct(r.ratio, 0)} del presupuesto
                    </p>
                  ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Siempre visible, encima de la barra flotante */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 px-3">
        <div className="card pointer-events-auto mx-auto flex max-w-md items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="muted truncate text-xs">{viewLabel}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className={`h-full rounded-full ${usedRatio >= 1 ? "bg-red-500" : usedRatio >= 0.8 ? "bg-amber-500" : "bg-[var(--color-brand)]"}`}
                style={{ width: `${Math.min(100, usedRatio * 100)}%` }}
              />
            </div>
          </div>
          <p className={`tabular shrink-0 text-xl font-bold ${available < 0 ? "text-red-600" : "text-[var(--color-brand)]"}`}>{formatCOP(available)}</p>
        </div>
      </div>
    </>
  );
}
