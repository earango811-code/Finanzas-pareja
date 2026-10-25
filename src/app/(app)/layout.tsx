import { BottomNav } from "@/components/bottom-nav";
import { getHousehold } from "@/lib/household";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await getHousehold();
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", me.household_id)
    .eq("status", "pendiente");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-28">
      {children}
      <BottomNav pending={count ?? 0} />
    </div>
  );
}
