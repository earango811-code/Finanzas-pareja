import { describe, expect, it } from "vitest";
import { resolveMonthIncomes } from "@/domain/incomes";
import { splitShares } from "@/domain/split";

const members = [
  { id: "esteban", display_name: "Esteban", monthly_income: 6_000_000, income_deductions: 0, deductions_note: null },
  { id: "mariana", display_name: "Mariana", monthly_income: 4_000_000, income_deductions: 0, deductions_note: null },
];
const row = (member_id: string, month: string, monthly_income: number) => ({ member_id, month, monthly_income, income_deductions: 0, deductions_note: null });
const rows = [row("esteban", "2026-11", 6_000_000), row("mariana", "2026-11", 4_000_000), row("mariana", "2027-01", 2_000_000)];

describe("ingresos por mes", () => {
  it("un mes sin registro propio usa el del último mes anterior", () => {
    const dic = resolveMonthIncomes(members, rows, "2026-12");
    expect(dic.map((m) => [m.monthly_income, m.incomeFrom])).toEqual([[6_000_000, "2026-11"], [4_000_000, "2026-11"]]);
  });

  it("el ingreso variable de un mes cambia el reparto de ese mes y de los siguientes", () => {
    expect(splitShares(resolveMonthIncomes(members, rows, "2026-11")).map((s) => s.ratio)).toEqual([0.6, 0.4]);
    expect(splitShares(resolveMonthIncomes(members, rows, "2027-01")).map((s) => s.ratio)).toEqual([0.75, 0.25]);
    expect(resolveMonthIncomes(members, rows, "2027-03")[1]).toMatchObject({ monthly_income: 2_000_000, incomeFrom: "2027-01" });
  });

  it("antes del primer registro usa el de la ficha del miembro", () => {
    expect(resolveMonthIncomes(members, rows, "2026-10")[1]).toMatchObject({ monthly_income: 4_000_000, incomeFrom: null });
  });
});
