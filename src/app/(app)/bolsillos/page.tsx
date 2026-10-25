import { PageHeader } from "@/components/page-header";
import { PocketsManager, type LeftoverInfo, type PocketView } from "@/components/pockets-manager";
import { buildBudgetRows } from "@/domain/budget";
import { currentMonth, isValidMonth, monthLabel, shiftMonth, todayBogota } from "@/domain/dates";
import { monthLeftover, pocketSummary } from "@/domain/pockets";
import { netIncome } from "@/domain/types";
import type { PocketMovementRow, PocketRow, TransactionRow } from "@/lib/db-types";
import { getHousehold } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";

export const metadata = { title: "Bolsillos" };

export default async function BolsillosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  // Por defecto se ofrece pasar el sobrante del mes anterior (ya cerrado)
  const leftoverMonth = isValidMonth(sp.mes) ? sp.mes : shiftMonth(currentMonth(), -1);
  const ctx = await getHousehold();
  const { supabase, me, members, categories } = ctx;

  const [pocketsRes, movementsRes, txRes, monthData] = await Promise.all([
    supabase.from("pockets").select("*").eq("household_id", me.household_id).order("sort_order").order("created_at").returns<PocketRow[]>(),
    supabase.from("pocket_movements").select("*").eq("household_id", me.household_id).order("occurred_on", { ascending: false }).returns<PocketMovementRow[]>(),
    supabase
      .from("transactions")
      .select("id, pocket_id, amount, kind, status, merchant, occurred_on")
      .eq("household_id", me.household_id)
      .not("pocket_id", "is", null)
      .order("occurred_on", { ascending: false })
      .returns<Pick<TransactionRow, "id" | "pocket_id" | "amount" | "kind" | "status" | "merchant" | "occurred_on">[]>(),
    loadMonth(ctx, leftoverMonth),
  ]);
  const movements = movementsRes.data ?? [];
  const pocketTxs = txRes.data ?? [];

  const pockets: PocketView[] = (pocketsRes.data ?? []).map((p) => {
    const mv = movements.filter((m) => m.pocket_id === p.id);
    const tx = pocketTxs.filter((t) => t.pocket_id === p.id);
    return {
      ...p,
      summary: pocketSummary(p, mv, tx),
      history: [
        ...mv.map((m) => ({
          id: m.id,
          date: m.occurred_on,
          label: m.kind === "sobrante" ? `Sobrante de ${monthLabel(m.month!)}` : m.note || (m.kind === "aporte" ? "Aporte" : "Retiro"),
          amount: m.kind === "retiro" ? -m.amount : m.amount,
          movementId: m.id as string | null,
        })),
        ...tx.map((t) => ({
          id: t.id,
          date: t.occurred_on,
          label: t.merchant ?? "Gasto",
          amount: t.kind === "ingreso" ? t.amount : -t.amount,
          movementId: null as string | null,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    };
  });

  // Sobrante del mes: compartido y personal de cada uno
  const totalIncome = members.reduce((a, m) => a + netIncome(m), 0);
  const scopes: { key: string | null; label: string; income: number }[] = [
    { key: null, label: "Compartido", income: totalIncome },
    ...members.map((m) => ({ key: m.id, label: m.id === me.id ? "Mío" : `De ${m.display_name}`, income: netIncome(m) })),
  ];
  const leftovers: LeftoverInfo[] = scopes.map((s) => {
    const rows = buildBudgetRows({ lines: monthData.budgets, categories, txs: monthData.txs, incomeBase: s.income, memberId: s.key });
    const pocketIds = new Set((pocketsRes.data ?? []).filter((p) => p.owner_member_id === s.key).map((p) => p.id));
    const alreadyMoved = movements
      .filter((m) => m.kind === "sobrante" && m.month === leftoverMonth && pocketIds.has(m.pocket_id))
      .reduce((a, m) => a + m.amount, 0);
    return { ownerMemberId: s.key, label: s.label, leftover: monthLeftover(rows), alreadyMoved, hasBudget: rows.some((r) => r.budgeted > 0) };
  });

  return (
    <>
      <PageHeader title="Bolsillos" />
      <PocketsManager
        pockets={pockets}
        leftovers={leftovers.filter((l) => l.hasBudget)}
        leftoverMonth={leftoverMonth}
        leftoverMonthLabel={monthLabel(leftoverMonth)}
        today={todayBogota()}
        meId={me.id}
        members={members.map((m) => ({ id: m.id, name: m.id === me.id ? "Yo" : m.display_name }))}
      />
    </>
  );
}
