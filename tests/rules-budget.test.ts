import { describe, expect, it } from "vitest";
import { matchRule, suggest, type Rule } from "@/domain/rules";
import { buildBudgetRows, resolveBudgetAmounts, summarizeGroups, type BudgetLine } from "@/domain/budget";
import { normalizeMerchant, redactSensitive } from "@/domain/text";

const rule = (p: Partial<Rule>): Rule => ({
  id: "r",
  pattern: "",
  scope: "compartido",
  category_id: "mer",
  kind: "gasto",
  priority: 0,
  ...p,
});

describe("normalizeMerchant", () => {
  it.each([
    ["RAPPI COLOMBIA*DL", "rappi colombia dl"],
    ["TRADER JOES 776", "trader joes"],
    ["TARGET T0877", "target"],
    ["Éxito Laureles", "exito laureles"],
  ])("%s → %s", (a, b) => expect(normalizeMerchant(a)).toBe(b));
});

describe("redactSensitive", () => {
  it("deja solo los últimos 4", () => expect(redactSensitive("llave 3001234567 ok")).toBe("llave ******4567 ok"));
});

describe("reglas", () => {
  it("'D1' coincide con 'TIENDAS D1 LAURELES' y gana la más específica", () => {
    const rules = [rule({ id: "a", pattern: "D1" }), rule({ id: "b", pattern: "tiendas d1", category_id: "x" })];
    expect(matchRule("TIENDAS D1 LAURELES", rules)?.id).toBe("b");
  });

  it("la prioridad manda sobre la longitud", () => {
    const rules = [rule({ id: "a", pattern: "D1", priority: 10 }), rule({ id: "b", pattern: "tiendas d1" })];
    expect(matchRule("TIENDAS D1", rules)?.id).toBe("a");
  });

  it("sin regla, sugiere por historial del mismo comercio", () => {
    const s = suggest("RAPPI COLOMBIA*DL", [], [
      { merchant: "RAPPI COLOMBIA*DL", scope: "compartido", category_id: "sal", kind: "gasto" },
      { merchant: "RAPPI COLOMBIA*DL", scope: "compartido", category_id: "sal", kind: "gasto" },
      { merchant: "RAPPI COLOMBIA*DL", scope: "personal", category_id: "otr", kind: "gasto" },
    ]);
    expect(s).toMatchObject({ source: "historial", categoryId: "sal", scope: "compartido" });
    expect(s!.confidence).toBeCloseTo(2 / 3);
  });
});

describe("presupuesto", () => {
  const lines: BudgetLine[] = [
    { id: "b1", category_id: "mer", member_id: null, mode: "fijo", amount: 1_500_000, remainder_share: 0 },
    { id: "b2", category_id: "sal", member_id: null, mode: "fijo", amount: 1_500_000, remainder_share: 0 },
    { id: "b3", category_id: "aho", member_id: null, mode: "resto", amount: 0, remainder_share: 0.5 },
  ];
  const cats = [
    { id: "mer", name: "Mercado", budget_group: "necesidades" as const },
    { id: "sal", name: "Salidas", budget_group: "deseos" as const },
    { id: "aho", name: "Ahorro pareja", budget_group: "ahorro" as const },
    { id: "via", name: "Viajes", budget_group: "deseos" as const },
  ];

  it("el ahorro 'resto' toma su parte de lo que sobra, como el Excel", () => {
    expect(resolveBudgetAmounts(lines, 10_000_000).get("b3")).toBe(3_500_000);
  });

  it("alertas al 80 % y 100 % y categorías sin presupuesto", () => {
    const rows = buildBudgetRows({
      lines,
      categories: cats,
      incomeBase: 10_000_000,
      memberId: null,
      txs: [
        { amount: 1_200_000, kind: "gasto", scope: "compartido", status: "identificado", category_id: "mer", paid_by_member_id: "yo" },
        { amount: 1_600_000, kind: "gasto", scope: "compartido", status: "identificado", category_id: "sal", paid_by_member_id: "pa" },
        { amount: 900_000, kind: "gasto", scope: "compartido", status: "pendiente", category_id: "mer", paid_by_member_id: "yo" },
        { amount: 50_000, kind: "gasto", scope: "personal", status: "identificado", category_id: "mer", paid_by_member_id: "yo" },
        { amount: 70_000, kind: "gasto", scope: "compartido", status: "identificado", category_id: "via", paid_by_member_id: "yo" },
      ],
    });
    const by = Object.fromEntries(rows.map((r) => [r.categoryId, r]));
    expect(by.mer).toMatchObject({ spent: 1_200_000, alert: "alerta" });
    expect(by.sal.alert).toBe("excedido");
    expect(by.aho).toMatchObject({ spent: 0, alert: "ok" });
    expect(by.via).toMatchObject({ budgeted: 0, spent: 70_000 });

    const g = summarizeGroups(rows, 10_000_000);
    expect(g.find((x) => x.group === "deseos")).toMatchObject({ spent: 1_670_000, targetAmount: 3_000_000 });
  });

  it("lo gastado en subcategorías suma a la categoría principal; los ingresos no cuentan", () => {
    const withSubs = [
      ...cats,
      { id: "uber", name: "Uber", budget_group: "deseos" as const, parent_id: "sal" },
      { id: "cine", name: "Cine", budget_group: "deseos" as const, parent_id: "sal" },
      { id: "ing", name: "Ingresos", budget_group: null, is_income: true },
      { id: "sueldo", name: "Salario", budget_group: null, parent_id: "ing", is_income: true },
    ];
    const t = (category_id: string, amount: number, kind: "gasto" | "ingreso" = "gasto") => ({
      amount, kind, scope: "compartido" as const, status: "identificado" as const, category_id, paid_by_member_id: "yo",
    });
    const rows = buildBudgetRows({
      lines, categories: withSubs, incomeBase: 10_000_000, memberId: null,
      txs: [t("uber", 100_000), t("cine", 50_000), t("sal", 10_000), t("sueldo", 5_000_000, "ingreso")],
    });
    expect(rows.find((r) => r.categoryId === "sal")?.spent).toBe(160_000);
    expect(rows.some((r) => r.categoryId === "uber" || r.categoryId === "ing")).toBe(false);
  });
});
