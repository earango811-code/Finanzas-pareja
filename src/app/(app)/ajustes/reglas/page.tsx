import { PageHeader } from "@/components/page-header";
import { RulesList } from "@/components/settings";
import { categoryLabel } from "@/lib/categories";
import type { RuleRow } from "@/lib/db-types";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Reglas automáticas" };

export default async function ReglasPage() {
  const { supabase, me, allCategories } = await getHousehold();
  const { data } = await supabase
    .from("rules")
    .select("*")
    .eq("household_id", me.household_id)
    .order("created_at", { ascending: false })
    .returns<RuleRow[]>();
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  return (
    <>
      <PageHeader title="Reglas automáticas" backHref="/mas" />
      <div className="flex flex-col gap-3 px-4 pb-8">
        <p className="muted text-xs">
          “Automática”: las alertas de ese comercio entran ya clasificadas. “Sugerencia”: van a Pendientes con la sugerencia
          lista para aceptar.
        </p>
        <RulesList rules={(data ?? []).map((r) => ({ ...r, categoryName: r.category_id ? categoryLabel(r.category_id, catById) : null }))} />
      </div>
    </>
  );
}
