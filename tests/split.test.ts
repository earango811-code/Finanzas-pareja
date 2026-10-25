import { describe, expect, it } from "vitest";
import { computeSettlement, splitShares, type SettlementTx } from "@/domain/split";
import type { Member } from "@/domain/types";

// Cifras ficticias con el mismo reparto del Excel (~67,8 / 32,2), con un descuento fijo en la pareja
const yo: Member = { id: "yo", display_name: "Yo", monthly_income: 5_420_000, income_deductions: 0 };
const pareja: Member = { id: "pa", display_name: "Pareja", monthly_income: 3_580_000, income_deductions: 1_000_000 };
const members = [yo, pareja];

const tx = (p: Partial<SettlementTx>): SettlementTx => ({
  amount: 0,
  kind: "gasto",
  scope: "compartido",
  status: "identificado",
  paid_by_member_id: "yo",
  ...p,
});

describe("splitShares", () => {
  it("calcula el % por ingreso neto como el Excel (~67,8 / 32,2)", () => {
    const [a, b] = splitShares(members);
    expect(a.ratio).toBeCloseTo(0.6775, 3);
    expect(b.ratio).toBeCloseTo(0.3225, 3);
  });

  it("mitad y mitad si no hay ingresos", () => {
    const s = splitShares([
      { ...yo, monthly_income: 0 },
      { ...pareja, monthly_income: 0, income_deductions: 0 },
    ]);
    expect(s.map((x) => x.ratio)).toEqual([0.5, 0.5]);
  });
});

describe("computeSettlement", () => {
  it("si uno paga todo, el otro le debe su %", () => {
    const r = computeSettlement(members, [tx({ amount: 1_000_000, paid_by_member_id: "yo" })]);
    expect(r.sharedTotal).toBe(1_000_000);
    expect(r.transfer).toMatchObject({ from: "pa", to: "yo", amount: r.balances[1].owes });
    expect(r.balances[0].owes + r.balances[1].owes).toBe(1_000_000);
  });

  it("ignora personales, pendientes, ignorados, transferencias internas y pagos de tarjeta", () => {
    const r = computeSettlement(members, [
      tx({ amount: 500_000, scope: "personal" }),
      tx({ amount: 500_000, status: "pendiente" }),
      tx({ amount: 500_000, status: "ignorado" }),
      tx({ amount: 500_000, kind: "transferencia_interna", scope: null }),
      tx({ amount: 500_000, kind: "pago_tarjeta", scope: null }),
    ]);
    expect(r.sharedTotal).toBe(0);
    expect(r.transfer).toBeNull();
  });

  it("los reembolsos compartidos restan", () => {
    const r = computeSettlement(members, [
      tx({ amount: 300_000, paid_by_member_id: "pa" }),
      tx({ amount: 100_000, kind: "ingreso", paid_by_member_id: "pa" }),
    ]);
    expect(r.sharedTotal).toBe(200_000);
    expect(r.balances[1].paid).toBe(200_000);
  });

  it("si cada uno pagó su parte, quedan prácticamente a paz y salvo", () => {
    const r = computeSettlement(members, [
      tx({ amount: 677_500, paid_by_member_id: "yo" }),
      tx({ amount: 322_500, paid_by_member_id: "pa" }),
    ]);
    expect(Math.abs(r.balances[0].balance)).toBeLessThanOrEqual(100);
  });

  it("una liquidación registrada cancela la deuda", () => {
    const base = [tx({ amount: 1_000_000, paid_by_member_id: "yo" })];
    const debt = computeSettlement(members, base).transfer!;
    const r = computeSettlement(members, [
      ...base,
      tx({ amount: debt.amount, kind: "liquidacion", scope: null, paid_by_member_id: "pa", counterparty_member_id: "yo" }),
    ]);
    expect(r.transfer).toBeNull();
  });
});
