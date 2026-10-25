import { PageHeader } from "@/components/page-header";
import { PendingInbox, type PendingCard, type PocketOption } from "@/components/pending-inbox";
import { suggest, type HistoryItem, type Rule } from "@/domain/rules";
import { toOptions } from "@/lib/categories";
import { TX_COLUMNS, type TransactionRow } from "@/lib/db-types";
import { getHousehold, memberName } from "@/lib/household";

export const metadata = { title: "Pendientes" };

export default async function PendientesPage() {
  const ctx = await getHousehold();
  const { supabase, me, accounts, categories } = ctx;
  const since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);

  const [pending, rules, history, pocketsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select(TX_COLUMNS)
      .eq("household_id", me.household_id)
      .eq("status", "pendiente")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<TransactionRow[]>(),
    supabase.from("rules").select("id, pattern, scope, category_id, kind, priority").eq("household_id", me.household_id).returns<Rule[]>(),
    supabase
      .from("transactions")
      .select("merchant, scope, category_id, kind")
      .eq("household_id", me.household_id)
      .eq("status", "identificado")
      .gte("occurred_on", since)
      .limit(2000)
      .returns<HistoryItem[]>(),
    supabase
      .from("pockets")
      .select("id, name, owner_member_id")
      .eq("household_id", me.household_id)
      .eq("is_active", true)
      .order("sort_order")
      .returns<PocketOption[]>(),
  ]);
  const pockets = pocketsRes.data ?? [];

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const cards: PendingCard[] = (pending.data ?? []).map((t) => {
    const acct = t.account_id ? accountById.get(t.account_id) : undefined;
    return {
      id: t.id,
      amount: t.amount,
      kind: t.kind,
      merchant: t.merchant ?? t.raw_description ?? "Sin descripción",
      date: t.occurred_on,
      account: acct
        ? `${acct.name}${acct.last4 ? ` *${acct.last4}` : ""}`
        : t.account_last4
          ? `*${t.account_last4} (registrar en Ajustes)`
          : null,
      paidBy: memberName(ctx, t.paid_by_member_id),
      paidById: t.paid_by_member_id,
      isMine: t.paid_by_member_id === me.id,
      source: t.source,
      suggestion: suggest(t.merchant, rules.data ?? [], history.data ?? []),
    };
  });

  // Chips: categorías más usadas en los últimos 6 meses primero
  const usage = new Map<string, number>();
  for (const h of history.data ?? []) if (h.category_id) usage.set(h.category_id, (usage.get(h.category_id) ?? 0) + 1);
  const chipCategories = toOptions(
    [...categories].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sort_order - b.sort_order),
  );

  return (
    <>
      <PageHeader title={`Pendientes${cards.length ? ` (${cards.length})` : ""}`} />
      <PendingInbox cards={cards} categories={chipCategories} pockets={pockets} />
    </>
  );
}
