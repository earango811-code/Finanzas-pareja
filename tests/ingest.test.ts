import { describe, expect, it } from "vitest";
import { classifyIncoming, findAccount, matchRecurring, type IngestAccount, type IngestRule, type RecurringCandidate } from "@/domain/ingest";
import { deriveMemberKey, sign, verifySignature } from "@/lib/hmac";

describe("firma HMAC", () => {
  const key = deriveMemberKey("maestro-de-prueba", "miembro-1");
  const body = JSON.stringify({ messages: [] });
  const now = 1_800_000_000;
  const ts = String(now);

  it("acepta una firma válida", () => {
    expect(verifySignature({ key, timestamp: ts, signature: sign(key, ts, body), body, nowSeconds: now })).toEqual({ ok: true });
  });
  it("rechaza si cambian el cuerpo", () => {
    const r = verifySignature({ key, timestamp: ts, signature: sign(key, ts, body), body: body + " ", nowSeconds: now });
    expect(r).toMatchObject({ ok: false, reason: "firma_invalida" });
  });
  it("la clave de un miembro no sirve para el otro", () => {
    const other = deriveMemberKey("maestro-de-prueba", "miembro-2");
    expect(other).not.toBe(key);
    expect(verifySignature({ key, timestamp: ts, signature: sign(other, ts, body), body, nowSeconds: now }).ok).toBe(false);
  });
  it("rechaza solicitudes viejas (reenvío) o sin firma", () => {
    expect(verifySignature({ key, timestamp: ts, signature: sign(key, ts, body), body, nowSeconds: now + 301 })).toMatchObject({ reason: "fuera_de_tiempo" });
    expect(verifySignature({ key, timestamp: null, signature: null, body })).toMatchObject({ reason: "sin_firma" });
    expect(verifySignature({ key, timestamp: ts, signature: "zz", body, nowSeconds: now }).ok).toBe(false);
  });
});

const acct = (p: Partial<IngestAccount>): IngestAccount => ({
  id: "x", owner_member_id: "yo", type: "debito", last4: null, card_last4: null, is_active: true, ...p,
});

describe("findAccount", () => {
  const accounts = [
    acct({ id: "tc", type: "credito", last4: "1111" }),
    acct({ id: "ahorros", type: "debito", last4: "4444", card_last4: "3333" }),
    acct({ id: "tc-pareja", owner_member_id: "pa", type: "credito", last4: "2222" }),
    acct({ id: "efectivo", type: "efectivo" }),
  ];
  it("tarjeta de crédito por últimos 4", () => {
    expect(findAccount(accounts, "yo", { type: "credito", last4: "1111" })?.id).toBe("tc");
  });
  it("compra con tarjeta débito encuentra la cuenta por la tarjeta asociada", () => {
    expect(findAccount(accounts, "yo", { type: "debito", last4: "3333" })?.id).toBe("ahorros");
  });
  it("transferencia encuentra la cuenta por sus últimos 4", () => {
    expect(findAccount(accounts, "yo", { type: "debito", last4: "4444" })?.id).toBe("ahorros");
  });
  it("sin dígitos usa la única cuenta débito", () => {
    expect(findAccount(accounts, "yo", { type: "debito", last4: null })?.id).toBe("ahorros");
  });
  it("devuelve null si no está registrada", () => {
    expect(findAccount(accounts, "yo", { type: "credito", last4: "9999" })).toBeNull();
  });
});

const rec = (p: Partial<RecurringCandidate>): RecurringCandidate => ({
  id: "r1", amount: 400_000, occurred_on: "2026-10-15", paid_by_member_id: "yo", scope: "compartido", category_id: "empleada", kind: "gasto", ...p,
});
const rule = (p: Partial<IngestRule>): IngestRule => ({
  id: "regla", pattern: "d1", scope: "compartido", category_id: "mercado", kind: "gasto", priority: 0, auto_apply: true, ...p,
});

describe("matchRecurring", () => {
  it("empareja mismo valor ±3 días y toma la fecha más cercana", () => {
    const c = [rec({ id: "lejos", occurred_on: "2026-10-12" }), rec({ id: "cerca", occurred_on: "2026-10-16" })];
    expect(matchRecurring(c, { amount: 400_000, date: "2026-10-15", kind: "gasto" }, "yo")?.id).toBe("cerca");
  });
  it("no empareja otro valor, otro miembro o fuera de la ventana", () => {
    expect(matchRecurring([rec({})], { amount: 400_001, date: "2026-10-15", kind: "gasto" }, "yo")).toBeNull();
    expect(matchRecurring([rec({})], { amount: 400_000, date: "2026-10-15", kind: "gasto" }, "pa")).toBeNull();
    expect(matchRecurring([rec({})], { amount: 400_000, date: "2026-10-20", kind: "gasto" }, "yo")).toBeNull();
  });
});

describe("classifyIncoming", () => {
  const m = { merchant: "TIENDAS D1 LAURELES", kind: "gasto" as const, amount: 80_000, date: "2026-10-15" };

  it("con regla automática entra identificado", () => {
    expect(classifyIncoming(m, "yo", [rule({})], [])).toMatchObject({ status: "identificado", category_id: "mercado", appliedRuleId: "regla" });
  });
  it("una regla de solo sugerencia lo deja pendiente", () => {
    expect(classifyIncoming(m, "yo", [rule({ auto_apply: false })], [])).toMatchObject({ status: "pendiente", appliedRuleId: null });
  });
  it("la recurrente que la esperaba gana sobre la regla", () => {
    const r = classifyIncoming({ ...m, amount: 400_000 }, "yo", [rule({})], [rec({})]);
    expect(r).toMatchObject({ status: "identificado", category_id: "empleada", matchedRecurringId: "r1" });
  });
  it("regla de pago de tarjeta: identificado sin categoría", () => {
    const r = classifyIncoming({ ...m, merchant: "PAGO TC BANCOLOMBIA" }, "yo", [rule({ pattern: "pago tc", kind: "pago_tarjeta", scope: null, category_id: null })], []);
    expect(r).toMatchObject({ status: "identificado", kind: "pago_tarjeta", scope: null, category_id: null });
  });
  it("una devolución (ingreso) no se vuelve gasto por la regla del comercio", () => {
    expect(classifyIncoming({ ...m, kind: "ingreso" }, "yo", [rule({})], [])).toMatchObject({ status: "pendiente", kind: "ingreso" });
  });
  it("sin nada, pendiente", () => {
    expect(classifyIncoming(m, "yo", [], [])).toMatchObject({ status: "pendiente", kind: "gasto" });
  });
});
