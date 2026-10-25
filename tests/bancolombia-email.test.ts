import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBancolombiaEmail } from "@/domain/parsers/bancolombia-email";

const fx = (name: string) => readFileSync(path.join(__dirname, "fixtures/emails", name), "utf8");

function ok(name: string) {
  const r = parseBancolombiaEmail(fx(name));
  if (!r.ok) throw new Error(`${name}: ${r.reason} → ${r.text}`);
  return r.movement;
}

describe("parser de alertas Bancolombia", () => {
  it("compra con tarjeta de crédito", () => {
    expect(ok("compra-credito.txt")).toMatchObject({
      type: "compra_credito",
      kind: "gasto",
      amount: 36150,
      merchant: "RAPPI COLOMBIA*DL",
      account: { type: "credito", last4: "1111" },
      date: "2026-10-24",
      occurredAt: "2026-10-24T14:44:00-05:00",
    });
  });

  it("compra con crédito en formato 'esta compra esta asociada a' y centavos redondeados", () => {
    const m = ok("compra-credito-asociada.txt");
    expect(m.amount).toBe(52820);
    expect(m.merchant).toBe("UBER BV USD-USD COLO");
    expect(m.account).toEqual({ type: "credito", last4: "2222" });
    expect(m.date).toBe("2026-10-16");
  });

  it("compra con débito", () => {
    expect(ok("compra-debito.txt")).toMatchObject({
      type: "compra_debito",
      amount: 59500,
      merchant: "DLO*CSRA_CO",
      account: { type: "debito", last4: "3333" },
    });
  });

  it("transferencia a cuenta con año de 2 dígitos", () => {
    const m = ok("transferencia-cuenta.txt");
    expect(m).toMatchObject({ type: "transferencia_enviada", amount: 20000, date: "2026-10-20", account: { last4: "4444" } });
    expect(m.merchant).toBe("Transferencia a cuenta *8877");
  });

  it("transferencia sin decimales", () => {
    expect(ok("transferencia-cuenta-sin-decimales.txt").amount).toBe(280000);
  });

  it("transferencia por llave con formato $32,400.00", () => {
    expect(ok("transferencia-llave.txt")).toMatchObject({
      type: "transferencia_enviada",
      amount: 32400,
      merchant: "PEDRO PEREZ GOMEZ",
      date: "2026-10-24",
    });
  });

  it("transferencia recibida es ingreso", () => {
    expect(ok("transferencia-recibida.txt")).toMatchObject({
      type: "transferencia_recibida",
      kind: "ingreso",
      amount: 512000,
      merchant: "CARLOS RUIZ MORA",
    });
  });

  it("pago recibido de proveedor", () => {
    expect(ok("pago-recibido.txt")).toMatchObject({
      type: "pago_recibido",
      kind: "ingreso",
      amount: 3117459,
      merchant: "EMPRESA FICTICIA SAS",
      account: { last4: null },
    });
  });

  it("pago de factura / PSE con hora con segundos", () => {
    expect(ok("pago-factura.txt")).toMatchObject({
      type: "pago_factura",
      amount: 116600,
      merchant: "Fondo Rotatorio del Ministerio",
      occurredAt: "2026-10-01T12:31:42-05:00",
    });
  });

  it("retiro (formato supuesto) es transferencia interna a efectivo", () => {
    expect(ok("retiro-SUPUESTO.txt")).toMatchObject({ type: "retiro", kind: "transferencia_interna", amount: 300000 });
  });

  it("acepta el cuerpo en HTML", () => {
    expect(ok("compra-credito.html")).toMatchObject({ amount: 45000, merchant: "MILENIUM LICORES", date: "2026-10-14" });
  });

  it("descarta alertas que no son movimientos", () => {
    expect(parseBancolombiaEmail(fx("tarjeta-apagada.txt"))).toMatchObject({ ok: false, reason: "no_transaccional" });
  });

  it("marca formatos desconocidos sin romperse", () => {
    const r = parseBancolombiaEmail("Bancolombia: Algo nuevo que nunca habíamos visto por $1.000.");
    expect(r).toMatchObject({ ok: false, reason: "formato_desconocido" });
  });

  it("enmascara llaves y cuentas largas en el texto guardado", () => {
    const m = ok("transferencia-llave.txt");
    expect(m.text).not.toContain("3001234567");
    expect(m.text).toContain("******4567");
  });
});
