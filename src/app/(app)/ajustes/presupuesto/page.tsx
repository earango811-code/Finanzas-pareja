import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BudgetEditor } from "@/components/settings";
import { budgetCoverage, buildBudgetRows } from "@/domain/budget";
import { formatCOP, formatPct } from "@/domain/money";
import { netIncome } from "@/domain/types";
import type { BudgetRowDb } from "@/lib/db-types";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Presupuesto por grupo" };

export default async function PresupuestoGruposPage() {
  const { supabase, me, members, categories } = await getHousehold();
  const { data } = await supabase.from("budgets").select("*").eq("household_id", me.household_id).returns<BudgetRowDb[]>();
  const budgets = data ?? [];
  const income = members.reduce((a, m) => a + netIncome(m), 0);
  const rows = buildBudgetRows({ lines: budgets, categories, txs: [], incomeBase: income, memberId: null });
  const c = budgetCoverage(rows, income);
  const memberOpts = members.map((m) => ({ id: m.id, name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name }));

  return (
    <>
      <PageHeader title="Presupuesto por grupo" backHref="/mas" />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <section className="card flex flex-col gap-1 p-4 text-sm">
          <div className="flex justify-between">
            <span className="muted">Ingresos de los dos</span>
            <span className="tabular font-semibold">{formatCOP(c.income)}</span>
          </div>
          <div className="flex justify-between">
            <span className="muted">Gastos + ahorro (compartido)</span>
            <span className="tabular font-semibold">{formatCOP(c.assigned)}</span>
          </div>
          <p className={`mt-1 text-xs ${c.unassigned === 0 ? "text-emerald-700" : c.unassigned > 0 ? "text-amber-700" : "text-red-600"}`}>
            {c.unassigned === 0
              ? "✓ Cubre el 100 % del ingreso"
              : c.unassigned > 0
                ? `Faltan ${formatCOP(c.unassigned)} por asignar (${formatPct(c.ratio, 0)})`
                : `Se pasa del ingreso por ${formatCOP(-c.unassigned)}`}
          </p>
        </section>
        <p className="muted text-xs">
          Toca un grupo para cambiar su monto. “Fijo” es un monto; “% del resto” toma un porcentaje de lo que sobra del ingreso
          después de los fijos (así se calcula el Ahorro).
        </p>
        <BudgetEditor categories={categories} budgets={budgets} members={memberOpts} />
        <Link href="/ajustes/categorias" className="block text-center text-sm font-medium text-[var(--color-brand)]">
          Crear o editar grupos y categorías →
        </Link>
      </div>
    </>
  );
}
