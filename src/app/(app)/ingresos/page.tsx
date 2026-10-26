import { IncomesEditor } from "@/components/incomes-editor";
import { PageHeader } from "@/components/page-header";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Ingresos" };

export default async function IngresosPage() {
  const { me, members } = await getHousehold();
  return (
    <>
      <PageHeader title="Ingresos" backHref="/mas" />
      <IncomesEditor
        members={members.map((m) => ({
          id: m.id,
          name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name,
          monthly_income: m.monthly_income,
          income_deductions: m.income_deductions,
          deductions_note: m.deductions_note,
        }))}
      />
    </>
  );
}
