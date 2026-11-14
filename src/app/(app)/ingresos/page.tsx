import { IncomesEditor } from "@/components/incomes-editor";
import { PageHeader } from "@/components/page-header";
import { defaultMonth, isValidMonth, monthLabel } from "@/domain/dates";
import { getHousehold } from "@/lib/household";
import { membersForMonth } from "@/lib/incomes";

export const metadata = { title: "Ingresos" };

export default async function IngresosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const ctx = await getHousehold();
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth(ctx.household.start_month);
  const members = await membersForMonth(ctx, month);
  // Si el mes no tiene ingreso propio, se muestra de qué mes viene
  const from = members.find((m) => m.incomeFrom && m.incomeFrom !== month)?.incomeFrom ?? null;

  return (
    <>
      <PageHeader title="Ingresos" month={month} basePath="/ingresos" backHref="/mas" />
      <IncomesEditor
        key={month}
        month={month}
        monthLabel={monthLabel(month)}
        carriedFrom={from ? monthLabel(from) : null}
        members={members.map((m) => ({
          id: m.id,
          name: m.id === ctx.me.id ? `${m.display_name} (yo)` : m.display_name,
          monthly_income: m.monthly_income,
          income_deductions: m.income_deductions,
          deductions_note: m.deductions_note,
        }))}
      />
    </>
  );
}
