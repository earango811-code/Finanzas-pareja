import { PageHeader } from "@/components/page-header";
import { QuickEntryForm } from "@/components/quick-entry-form";
import { todayBogota } from "@/domain/dates";
import { toOptions } from "@/lib/categories";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Registrar" };

export default async function NuevoPage() {
  const { supabase, me, members, accounts, categories } = await getHousehold();
  const { data: pockets } = await supabase
    .from("pockets")
    .select("id, name, owner_member_id")
    .eq("household_id", me.household_id)
    .eq("is_active", true)
    .order("sort_order")
    .returns<{ id: string; name: string; owner_member_id: string | null }[]>();
  return (
    <>
      <PageHeader title="Registrar movimiento" />
      <QuickEntryForm
        today={todayBogota()}
        meId={me.id}
        members={members.map((m) => ({ id: m.id, name: m.id === me.id ? "Yo" : m.display_name }))}
        accounts={accounts.filter((a) => a.is_active).map((a) => ({ id: a.id, name: a.name, type: a.type, ownerId: a.owner_member_id }))}
        categories={toOptions(categories)}
        pockets={pockets ?? []}
      />
    </>
  );
}
