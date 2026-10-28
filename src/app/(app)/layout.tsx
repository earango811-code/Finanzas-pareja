import Link from "next/link";
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
      {!me.pin_set_at && (
        <Link
          href="/ajustes/acceso"
          className="mx-4 mt-[max(0.75rem,env(safe-area-inset-top))] block rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          🔑 Crea tu PIN de 4 números para entrar fácil desde el celular →
        </Link>
      )}
      {children}
      <BottomNav pending={count ?? 0} />
    </div>
  );
}
