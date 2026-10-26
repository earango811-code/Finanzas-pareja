import { PageHeader } from "@/components/page-header";
import { CategoryManager } from "@/components/category-manager";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Editar categorías" };

export default async function CategoriasPage() {
  const { supabase, me, allCategories } = await getHousehold();

  // Cuántos movimientos tiene cada categoría (para saber si se puede eliminar sin moverlos)
  const [{ data }, { data: pockets }] = await Promise.all([
    supabase
      .from("transactions")
      .select("category_id")
      .eq("household_id", me.household_id)
      .not("category_id", "is", null)
      .limit(50000)
      .returns<{ category_id: string }[]>(),
    supabase
      .from("pockets")
      .select("id, name")
      .eq("household_id", me.household_id)
      .eq("is_active", true)
      .order("sort_order")
      .returns<{ id: string; name: string }[]>(),
  ]);
  const counts: Record<string, number> = {};
  for (const t of data ?? []) counts[t.category_id] = (counts[t.category_id] ?? 0) + 1;

  return (
    <>
      <PageHeader title="Grupos y categorías" backHref="/mas" />
      <CategoryManager categories={allCategories} counts={counts} pockets={pockets ?? []} />
    </>
  );
}
