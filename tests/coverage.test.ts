import { describe, expect, it } from "vitest";
import { budgetCoverage, buildBudgetRows, type BudgetLine } from "@/domain/budget";
import { groupLeftovers } from "@/domain/pockets";

const categories = [
  { id: "mercado", name: "Mercado", budget_group: "necesidades" as const },
  { id: "ahorro", name: "Ahorro", budget_group: "ahorro" as const },
  { id: "viaje", name: "Viaje", budget_group: "ahorro" as const },
];
const lines: BudgetLine[] = [
  { id: "1", category_id: "mercado", member_id: null, mode: "fijo", amount: 2_000_000, remainder_share: 0 },
  { id: "2", category_id: "viaje", member_id: null, mode: "fijo", amount: 500_000, remainder_share: 0 },
  { id: "3", category_id: "ahorro", member_id: null, mode: "resto", amount: 0, remainder_share: 1 },
];
const tx = (category_id: string, amount: number) => ({
  amount, kind: "gasto" as const, scope: "compartido" as const, status: "identificado" as const, category_id, paid_by_member_id: "ana",
});

describe("budgetCoverage", () => {
  it("con Ahorro en '% del resto' el presupuesto cubre el 100 % del ingreso", () => {
    const rows = buildBudgetRows({ lines, categories, txs: [], incomeBase: 10_000_000, memberId: null });
    expect(budgetCoverage(rows, 10_000_000)).toMatchObject({ spending: 2_000_000, saving: 8_000_000, unassigned: 0, ratio: 1 });
  });

  it("sin el resto muestra lo que falta asignar", () => {
    const rows = buildBudgetRows({ lines: lines.slice(0, 2), categories, txs: [], incomeBase: 10_000_000, memberId: null });
    expect(budgetCoverage(rows, 10_000_000)).toMatchObject({ assigned: 2_500_000, unassigned: 7_500_000 });
  });

  it("si se pasan del ingreso, lo sin asignar es negativo", () => {
    const rows = buildBudgetRows({ lines: lines.slice(0, 2), categories, txs: [], incomeBase: 2_000_000, memberId: null });
    expect(budgetCoverage(rows, 2_000_000).unassigned).toBe(-500_000);
  });
});

describe("groupLeftovers", () => {
  it("lo que sobra de cada grupo de ahorro va a su bolsillo; nunca negativo", () => {
    const rows = buildBudgetRows({
      lines,
      categories,
      txs: [tx("viaje", 200_000), tx("ahorro", 9_000_000)],
      incomeBase: 10_000_000,
      memberId: null,
    });
    const r = groupLeftovers(rows, [
      { categoryId: "viaje", pocketId: "pv" },
      { categoryId: "ahorro", pocketId: "pa" },
      { categoryId: "sin-presupuesto", pocketId: "px" },
    ]);
    expect(r.map((x) => x.leftover)).toEqual([300_000, 0, 0]);
  });
});
