import { PageHeader } from "@/components/page-header";
import { RecurringManager } from "@/components/recurring-manager";
import { todayBogota } from "@/domain/dates";
import { toOptions } from "@/lib/categories";
import { getHousehold } from "@/lib/household";
import type { RecurringRow } from "@/lib/recurring-runner";

export const metadata = { title: "Recurrentes" };

export default async function RecurrentesPage() {
  const { supabase, me, members, accounts, categories, allCategories } = await getHousehold();
  const { data } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("household_id", me.household_id)
    .order("is_active", { ascending: false })
    .order("next_date")
    .returns<RecurringRow[]>();

  const byId = new Map(allCategories.map((c) => [c.id, c]));
  const labels = Object.fromEntries(
    allCategories.map((c) => {
      const p = c.parent_id ? byId.get(c.parent_id) : undefined;
      return [c.id, p ? `${p.name} › ${c.name}` : c.name];
    }),
  );

  return (
    <>
      <PageHeader title="Recurrentes" backHref="/mas" />
      <RecurringManager
        items={data ?? []}
        today={todayBogota()}
        meId={me.id}
        members={members.map((m) => ({ id: m.id, name: m.id === me.id ? "Yo" : m.display_name }))}
        accounts={accounts.filter((a) => a.is_active).map((a) => ({ id: a.id, name: a.name, ownerId: a.owner_member_id }))}
        categories={toOptions(categories)}
        categoryLabels={labels}
      />
    </>
  );
}
