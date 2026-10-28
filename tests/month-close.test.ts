import { describe, expect, it } from "vitest";
import { computeMonthClose, type CloseTx } from "@/domain/month-close";
import { reconcile, type AppTx } from "@/domain/reconcile";
import { parseStatement, parseStatementAmount, parseStatementDate } from "@/domain/statement";

describe("parseStatementAmount / parseStatementDate", () => {
  it("entiende los formatos de valor más comunes", () => {
    expect(parseStatementAmount("-57.500")).toBe(-57500);
    expect(parseStatementAmount("57.500,00")).toBe(57500);
    expect(parseStatementAmount("-57500.00")).toBe(-57500);
    expect(parseStatementAmount("$ 1.234.567")).toBe(1234567);
    expect(parseStatementAmount("(12.000)")).toBe(-12000);
    expect(parseStatementAmount("1,234,567")).toBe(1234567);
    expect(parseStatementAmount("hola")).toBeNull();
  });

  it("entiende las fechas más comunes", () => {
    expect(parseStatementDate("01/10/2026")).toBe("2026-10-01");
    expect(parseStatementDate("2026-10-01")).toBe("2026-10-01");
    expect(parseStatementDate("2026/10/01")).toBe("2026-10-01");
    expect(parseStatementDate("20261001")).toBe("2026-10-01");
    expect(parseStatementDate("1/10/26")).toBe("2026-10-01");
    expect(parseStatementDate("32/10/2026")).toBeNull();
  });
});

describe("parseStatement", () => {
  it("CSV con encabezado y columna de valor con signo", () => {
    const csv = `Fecha;Descripción;Valor;Saldo
01/11/2026;COMPRA EN D1 SAS;-45.300;1.000.000
02/11/2026;PAGO DE NOMINA;3.000.000;4.000.000
03/11/2026;CUOTA DE MANEJO;-14.900;3.985.100`;
    const r = parseStatement(csv);
    expect(r.lines).toEqual([
      { date: "2026-11-01", description: "COMPRA EN D1 SAS", amount: 45300, direction: "debito" },
      { date: "2026-11-02", description: "PAGO DE NOMINA", amount: 3000000, direction: "credito" },
      { date: "2026-11-03", description: "CUOTA DE MANEJO", amount: 14900, direction: "debito" },
    ]);
  });

  it("columnas separadas de débito y crédito", () => {
    const csv = `"Fecha","Detalle","Débito","Crédito"
"2026-11-05","UBER TRIP","18.500",""
"2026-11-06","TRANSFERENCIA RECIBIDA","","200.000"`;
    expect(parseStatement(csv).lines.map((l) => [l.amount, l.direction])).toEqual([
      [18500, "debito"],
      [200000, "credito"],
    ]);
  });

  it("CSV sin encabezado (como el de Bancolombia)", () => {
    const csv = `1234567890,,,20261101,,-57500.00,5034,COMPRA EN DOLLARCITY,0
1234567890,,,20261102,,1200000.00,1020,ABONO INTERESES AHORROS,0`;
    expect(parseStatement(csv).lines).toEqual([
      { date: "2026-11-01", description: "COMPRA EN DOLLARCITY", amount: 57500, direction: "debito" },
      { date: "2026-11-02", description: "ABONO INTERESES AHORROS", amount: 1200000, direction: "credito" },
    ]);
  });

  it("tarjeta de crédito con compras en positivo: invertir signos", () => {
    const r = parseStatement("Fecha,Descripción,Valor\n10/11/2026,NETFLIX,38.900", { invertSigns: true });
    expect(r.lines[0]).toMatchObject({ amount: 38900, direction: "debito" });
  });
});

describe("reconcile", () => {
  const tx = (id: string, date: string, amount: number, kind: AppTx["kind"] = "gasto"): AppTx => ({ id, date, amount, kind, description: id });
  const line = (date: string, amount: number, direction: "debito" | "credito" = "debito") => ({ date, amount, direction, description: "x" });

  it("empareja por valor y fecha cercana; separa lo que falta de cada lado", () => {
    const r = reconcile(
      [line("2026-11-02", 45300), line("2026-11-03", 14900), line("2026-11-10", 99000)],
      [tx("d1", "2026-11-01", 45300), tx("uber", "2026-11-05", 18500), tx("otro", "2026-11-20", 99000)],
    );
    expect(r.matched.map((m) => m.tx.id)).toEqual(["d1"]);
    expect(r.onlyInBank.map((l) => l.amount)).toEqual([14900, 99000]); // 99000 está a 10 días: no es el mismo
    expect(r.onlyInApp.map((t) => t.id)).toEqual(["uber", "otro"]);
  });

  it("con dos candidatos gana la fecha más cercana, y no mezcla gastos con ingresos", () => {
    const r = reconcile(
      [line("2026-11-05", 20000), line("2026-11-05", 20000, "credito")],
      [tx("a", "2026-11-03", 20000), tx("b", "2026-11-05", 20000), tx("dev", "2026-11-06", 20000, "ingreso")],
    );
    expect(r.matched.map((m) => m.tx.id).sort()).toEqual(["b", "dev"]);
    expect(r.onlyInApp.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("computeMonthClose", () => {
  const members = [
    { id: "esteban", display_name: "Esteban", monthly_income: 6_000_000, income_deductions: 0 },
    { id: "mariana", display_name: "Mariana", monthly_income: 4_500_000, income_deductions: 500_000 },
  ];
  const t = (amount: number, scope: CloseTx["scope"], paid: string, extra: Partial<CloseTx> = {}): CloseTx => ({
    amount, kind: "gasto", scope, status: "identificado", paid_by_member_id: paid, ...extra,
  });

  it("el ingreso final es el disponible menos su parte de lo compartido y de los bolsillos (60/40)", () => {
    const s = computeMonthClose(
      members,
      [
        t(5_000_000, "compartido", "esteban"),
        t(100_000, "compartido", "mariana", { kind: "ingreso" }), // reembolso
        t(300_000, "compartido", "esteban", { pocket_id: "viaje" }), // pagado desde el bolsillo: no sale del ingreso
        t(200_000, "personal", "mariana"),
        t(50_000, "compartido", "esteban", { status: "pendiente" }),
      ],
      2_000_000,
    );
    expect(s.sharedSpent).toBe(4_900_000);
    expect(s.savedTotal).toBe(10_000_000 - 4_900_000 - 2_000_000);
    expect(s.members).toEqual([
      { memberId: "esteban", ratio: 0.6, available: 6_000_000, sharedSpent: 2_940_000, toPockets: 1_200_000, finalIncome: 1_860_000, personalSpent: 0, free: 1_860_000 },
      { memberId: "mariana", ratio: 0.4, available: 4_000_000, sharedSpent: 1_960_000, toPockets: 800_000, finalIncome: 1_240_000, personalSpent: 200_000, free: 1_040_000 },
    ]);
    // El ahorro de los dos queda repartido en la misma proporción del gasto
    expect(s.members[0].finalIncome / s.savedTotal).toBeCloseTo(0.6);
  });
});
