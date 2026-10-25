// Carga de los movimientos y presupuestos de un mes.
import type { BudgetRowDb, TransactionRow } from "@/lib/db-types";
import { monthRange } from "@/domain/dates";
import type { HouseholdContext } from "@/lib/household";

export async function loadMonth(ctx: HouseholdContext, month: string) {
  const { start, end } = monthRange(month);
  const [txs, budgets, pending] = await Promise.all([
    ctx.supabase
      .from("transactions")
      .select("amount, kind, scope, status, category_id, paid_by_member_id, counterparty_member_id, pocket_id")
      .eq("household_id", ctx.me.household_id)
      .eq("status", "identificado")
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .returns<Pick<TransactionRow, "amount" | "kind" | "scope" | "status" | "category_id" | "paid_by_member_id" | "counterparty_member_id" | "pocket_id">[]>(),
    ctx.supabase.from("budgets").select("*").eq("household_id", ctx.me.household_id).returns<BudgetRowDb[]>(),
    ctx.supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.me.household_id)
      .eq("status", "pendiente")
      .gte("occurred_on", start)
      .lt("occurred_on", end),
  ]);
  return { txs: txs.data ?? [], budgets: budgets.data ?? [], pendingCount: pending.count ?? 0 };
}
