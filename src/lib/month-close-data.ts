// Datos del cierre de mes: los usa la pantalla y las acciones (para recalcular en el servidor).
import { buildBudgetRows } from "@/domain/budget";
import { monthRange } from "@/domain/dates";
import { computeMonthClose } from "@/domain/month-close";
import { groupLeftovers } from "@/domain/pockets";
import { computeSettlement } from "@/domain/split";
import { netIncome } from "@/domain/types";
import type { PocketMovementRow, PocketRow, TransactionRow } from "@/lib/db-types";
import type { HouseholdContext } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";

export interface ReconciliationInfo {
  at: string;
  lines: number;
  matched: number;
  added: number;
  removed: number;
}

export interface MonthCloseRow {
  id: string;
  month: string;
  reconciliations: Record<string, ReconciliationInfo>;
  closed_at: string | null;
  summary: unknown;
}

export async function loadCloseData(ctx: HouseholdContext, month: string) {
  const { supabase, me, members, categories, accounts } = ctx;
  const { start, end } = monthRange(month);
  const [monthData, pocketsRes, movementsRes, closeRes, accountTxRes] = await Promise.all([
    loadMonth(ctx, month),
    supabase.from("pockets").select("*").eq("household_id", me.household_id).returns<PocketRow[]>(),
    supabase
      .from("pocket_movements")
      .select("*")
      .eq("household_id", me.household_id)
      .eq("kind", "sobrante")
      .eq("month", month)
      .returns<PocketMovementRow[]>(),
    supabase.from("month_closes").select("id, month, reconciliations, closed_at, summary").eq("household_id", me.household_id).eq("month", month).maybeSingle<MonthCloseRow>(),
    // Movimientos con cuenta, por fecha real dentro del mes (el extracto va por fecha, no por mes del presupuesto)
    supabase
      .from("transactions")
      .select("id, occurred_on, amount, kind, merchant, account_id, status")
      .eq("household_id", me.household_id)
      .neq("status", "ignorado")
      .not("account_id", "is", null)
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .returns<Pick<TransactionRow, "id" | "occurred_on" | "amount" | "kind" | "merchant" | "account_id" | "status">[]>(),
  ]);
  const pockets = pocketsRes.data ?? [];
  const movements = movementsRes.data ?? [];
  const sharedPocketIds = new Set(pockets.filter((p) => p.owner_member_id === null).map((p) => p.id));

  // Saldos de los grupos de ahorro que van a su bolsillo
  const income = members.reduce((a, m) => a + netIncome(m), 0);
  const sharedRows = buildBudgetRows({ lines: monthData.budgets, categories, txs: monthData.txs, incomeBase: income, memberId: null });
  const links = categories
    .filter((c) => !c.parent_id && c.pocket_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ categoryId: c.id, pocketId: c.pocket_id! }));
  const groupCloses = groupLeftovers(sharedRows, links).map((g) => {
    const alreadyMoved = movements.filter((m) => m.category_id === g.categoryId).reduce((a, m) => a + m.amount, 0);
    return {
      ...g,
      groupName: categories.find((c) => c.id === g.categoryId)?.name ?? "Grupo",
      pocketName: pockets.find((p) => p.id === g.pocketId)?.name ?? "Bolsillo",
      alreadyMoved,
      remaining: Math.max(0, g.leftover - alreadyMoved),
    };
  });

  const pocketTransfers = movements.filter((m) => sharedPocketIds.has(m.pocket_id)).reduce((a, m) => a + m.amount, 0);
  const summary = computeMonthClose(members, monthData.txs, pocketTransfers);
  const settlement = computeSettlement(members, monthData.txs);

  const accountTxs = accountTxRes.data ?? [];
  const reconcilable = accounts
    .filter((a) => a.is_active && a.type !== "efectivo")
    .map((a) => ({
      ...a,
      txs: accountTxs
        .filter((t) => t.account_id === a.id)
        .map((t) => ({ id: t.id, date: t.occurred_on, amount: t.amount, kind: t.kind, description: t.merchant ?? "Movimiento" })),
    }));

  return {
    pendingCount: monthData.pendingCount,
    groupCloses,
    summary,
    settlement,
    close: closeRes.data ?? null,
    accounts: reconcilable,
  };
}
