import { describe, expect, it } from "vitest";
import { allocate, formatCOP, formatPct, parseAmountString } from "@/domain/money";

describe("formatCOP", () => {
  it("usa punto de miles y sin decimales", () => {
    expect(formatCOP(1234567)).toBe("$ 1.234.567");
    expect(formatCOP(0)).toBe("$ 0");
    expect(formatCOP(-5000)).toBe("-$ 5.000");
    expect(formatCOP(999.6)).toBe("$ 1.000");
  });

  it("formatPct", () => {
    expect(formatPct(0.6775)).toBe("67,8 %");
  });
});

describe("parseAmountString", () => {
  it.each([
    ["52.819,86", 52819.86],
    ["32,400.00", 32400],
    ["32400.00", 32400],
    ["280000", 280000],
    ["1.500", 1500],
    ["1.500.000", 1500000],
    ["300,00", 300],
    ["$ 45.000", 45000],
    ["1,2", 1.2],
    ["COP3.174,67", 3174.67],
  ])("%s → %d", (input, expected) => {
    expect(parseAmountString(input)).toBeCloseTo(expected, 2);
  });

  it("devuelve null sin dígitos", () => {
    expect(parseAmountString("abc")).toBeNull();
  });
});

describe("allocate", () => {
  it("no pierde pesos al repartir", () => {
    const r = allocate(100001, [0.6775, 0.3225]);
    expect(r[0] + r[1]).toBe(100001);
  });

  it("funciona con totales negativos (reembolsos)", () => {
    const r = allocate(-1001, [1, 1]);
    expect(r[0] + r[1]).toBe(-1001);
  });
});
