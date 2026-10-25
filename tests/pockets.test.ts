import { describe, expect, it } from "vitest";
import { buildBudgetRows, type BudgetLine } from "@/domain/budget";
import { monthLeftover, pocketFitsTx, pocketSummary } from "@/domain/pockets";
import { computeSettlement } from "@/domain/split";
import type { Member } from "@/domain/types";

describe("saldo del bolsillo", () => {
  it("suma inicial, aportes y sobrantes; resta retiros y gastos pagados desde el bolsillo", () => {
    const s = pocketSummary(
      { opening_balance: 500_000, target_amount: 5_000_000 },
      [
        { kind: "aporte", amount: 1_000_000 },
        { kind: "sobrante", amount: 300_000 },
        { kind: "retiro", amount: 100_000 },
      ],
      [
        { amount: 400_000, kind: "gasto", status: "identificado" },
        { amount: 50_000, kind: "ingreso", status: "identificado" }, // devolución
        { amount: 999_999, kind: "gasto", status: "pendiente" }, // no cuenta aún
      ],
    );
    expect(s).toMatchObject({ balance: 1_350_000, contributed: 1_300_000, spent: 450_000 });
    expect(s.progress).toBeCloseTo(0.27);
  });

  it("sin meta no hay progreso", () => {
    expect(pocketSummary({ opening_balance: 0, target_amount: null }, [], []).progress).toBeNull();
  });
});

describe("sobrante del mes", () => {
  const rows = [
    { budgetId: "1", categoryId: "mer", name: "Mercado", group: "necesidades" as const, budgeted: 1_500_000, spent: 1_200_000, ratio: 0.8, alert: "alerta" as const },
    { budgetId: "2", categoryId: "sal", name: "Salidas", group: "deseos" as const, budgeted: 1_500_000, spent: 1_700_000, ratio: 1.13, alert: "excedido" as const },
    { budgetId: "3", categoryId: "aho", name: "Ahorro", group: "ahorro" as const, budgeted: 2_000_000, spent: 0, ratio: 0, alert: "ok" as const },
  ];
  it("es lo presupuestado para gastar menos lo gastado (sin contar Ahorro)", () => {
    expect(monthLeftover(rows)).toBe(100_000);
  });
  it("nunca es negativo", () => {
    expect(monthLeftover([{ ...rows[1] }])).toBe(0);
  });
});

describe("gasto pagado desde bolsillo", () => {
  const lines: BudgetLine[] = [{ id: "b", category_id: "via", member_id: null, mode: "fijo", amount: 1_000_000, remainder_share: 0 }];
  const cats = [{ id: "via", name: "Viajes", budget_group: "deseos" as const }];
  const hotel = { amount: 800_000, kind: "gasto" as const, scope: "compartido" as const, status: "identificado" as const, category_id: "via", paid_by_member_id: "yo" };

  it("no se come el presupuesto del mes", () => {
    const sinBolsillo = buildBudgetRows({ lines, categories: cats, incomeBase: 10_000_000, memberId: null, txs: [hotel] });
    const conBolsillo = buildBudgetRows({ lines, categories: cats, incomeBase: 10_000_000, memberId: null, txs: [{ ...hotel, pocket_id: "viaje" }] });
    expect(sinBolsillo[0].spent).toBe(800_000);
    expect(conBolsillo[0].spent).toBe(0);
  });

  it("sí cuenta en quién le debe a quién (se reparte por %)", () => {
    const members: Member[] = [
      { id: "yo", display_name: "Yo", monthly_income: 6_000_000, income_deductions: 0 },
      { id: "pa", display_name: "Pareja", monthly_income: 4_000_000, income_deductions: 0 },
    ];
    const r = computeSettlement(members, [{ ...hotel }]);
    expect(r.transfer).toMatchObject({ from: "pa", to: "yo", amount: 320_000 });
  });

  it("bolsillo compartido para gastos compartidos; personal solo para quien pagó", () => {
    expect(pocketFitsTx(null, { scope: "compartido", paid_by_member_id: "yo" })).toBe(true);
    expect(pocketFitsTx("yo", { scope: "compartido", paid_by_member_id: "yo" })).toBe(false);
    expect(pocketFitsTx("yo", { scope: "personal", paid_by_member_id: "yo" })).toBe(true);
    expect(pocketFitsTx("pa", { scope: "personal", paid_by_member_id: "yo" })).toBe(false);
    expect(pocketFitsTx(null, { scope: null, paid_by_member_id: "yo" })).toBe(false);
  });
});
