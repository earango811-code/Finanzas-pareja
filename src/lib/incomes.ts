// Ingresos de un mes (ingresos variables), listos para el reparto y el presupuesto.
import { resolveMonthIncomes, type MonthIncomeRow } from "@/domain/incomes";
import type { HouseholdContext } from "@/lib/household";

export async function membersForMonth(ctx: HouseholdContext, month: string) {
  const { data } = await ctx.supabase
    .from("member_incomes")
    .select("member_id, month, monthly_income, income_deductions, deductions_note")
    .eq("household_id", ctx.me.household_id)
    .lte("month", month)
    .returns<MonthIncomeRow[]>();
  return resolveMonthIncomes(ctx.members, data ?? [], month);
}
