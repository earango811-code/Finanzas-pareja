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

  it("transferencia recibida (formato del remitente @an.)", () => {
    expect(ok("transferencia-recibida-v2.txt")).toMatchObject({
      type: "transferencia_recibida",
      kind: "ingreso",
      amount: 100000,
      merchant: "PERSONA FICTICIA",
      account: { type: "debito", last4: "1111" },
      date: "2026-10-30",
      occurredAt: "2026-10-30T14:57:00-05:00",
    });
  });

  it("retiro del fondo de inversión: movimiento entre productos propios", () => {
    expect(ok("inversion-retiro.txt")).toMatchObject({
      type: "inversion",
      kind: "transferencia_interna",
      amount: 7000000,
      merchant: "Retiro de Fiducuenta *2222",
      account: { type: "otro", last4: "2222" },
      date: "2026-10-23",
      occurredAt: "2026-10-23T09:22:13-05:00",
    });
  });

  describe("formatos nuevos (nov-2026)", () => {
    const parse = (t: string, at?: string) => {
      const r = parseBancolombiaEmail(`Bancolombia: ${t} Si tienes dudas, llámanos`, at);
      if (!r.ok) throw new Error(`${r.reason}: ${r.text}`);
      return r.movement;
    };

    it("pago con código QR", () => {
      expect(parse("NOMBRE FICTICIO pagaste $7,700.00 por codigo QR desde tu cuenta *1111 a la llave @***2051 el 18/11/2026 a las 13:34. Con codigo QR es facil y de una.")).toMatchObject({
        type: "pago_qr", kind: "gasto", amount: 7700, merchant: "Pago QR a @***2051", account: { last4: "1111" }, date: "2026-11-18",
      });
    });

    it("pago con Botón Bancolombia (PSE)", () => {
      expect(parse("Transferiste $379,572.00 por Boton Bancolombia a EMPRESA FICTICIA SAS desde producto *1111. 19/11/2026 16:39:35")).toMatchObject({
        type: "pago_pse", kind: "gasto", amount: 379572, merchant: "EMPRESA FICTICIA SAS", account: { last4: "1111" }, date: "2026-11-19", occurredAt: "2026-11-19T16:39:35-05:00",
      });
    });

    it("consignación recibida y pago recibido (ingresos: luego no se traen)", () => {
      expect(parse("Recibiste una consignacion por $700,000 desde el corresponsal TIENDA FICTICIA en CALI, el 03/11/26 09:29.")).toMatchObject({ kind: "ingreso", amount: 700000, date: "2026-11-03" });
      expect(parse("Recibiste un pago por $3,220,000.00 de EMPRESA FICTICIA a tu cuenta AHORROS, el 19:16 a las 17/11/2026.")).toMatchObject({ kind: "ingreso", amount: 3220000, date: "2026-11-17", occurredAt: "2026-11-17T19:16:00-05:00" });
    });

    it("abono automático a la tarjeta: pago de tarjeta con la fecha del correo", () => {
      expect(parse("Debitamos de tu cuenta/bolsillo $31,140.34 para abonar a la deuda en en Dólares. de tu tarjeta de credito AMEX **1111. Encontraras el abono el proximo dia habil.", "2026-11-19T14:12:00Z")).toMatchObject({
        type: "abono_tarjeta", kind: "pago_tarjeta", amount: 31140, account: { type: "credito", last4: "1111" }, date: "2026-11-19",
      });
    });

    it("compra rechazada: no es un movimiento", () => {
      const r = parseBancolombiaEmail("Bancolombia: tu compra en TIENDA por COP628.546,00 no fue exitosa, el cupo de tu T.Credito *1111 no se afecto. 10:58.01/11/2026.");
      expect(r).toMatchObject({ ok: false, reason: "no_transaccional" });
    });
  });
});
