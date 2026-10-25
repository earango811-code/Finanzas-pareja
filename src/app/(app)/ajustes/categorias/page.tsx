import Link from "next/link";
import { CategoryManager } from "@/components/category-manager";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Editar categorías" };

export default async function CategoriasPage() {
  const { supabase, me, allCategories } = await getHousehold();

  // Cuántos movimientos tiene cada categoría (para saber si se puede eliminar sin moverlos)
  const { data } = await supabase
    .from("transactions")
    .select("category_id")
    .eq("household_id", me.household_id)
    .not("category_id", "is", null)
    .limit(50000)
    .returns<{ category_id: string }[]>();
  const counts: Record<string, number> = {};
  for (const t of data ?? []) counts[t.category_id] = (counts[t.category_id] ?? 0) + 1;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[var(--bg)]/95 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
        <Link href="/ajustes" className="btn btn-ghost !min-h-10 !px-3" aria-label="Volver">‹</Link>
        <h1 className="text-xl font-bold">Editar categorías</h1>
      </header>
      <CategoryManager categories={allCategories} counts={counts} />
    </>
  );
}
