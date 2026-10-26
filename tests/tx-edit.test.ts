import { describe, expect, it } from "vitest";
import { normalizeTxEdit, type TxEdit } from "@/domain/tx-edit";

const base: TxEdit = {
  kind: "gasto",
  date: "2026-11-03",
  budgetMonth: null,
  scope: "compartido",
  categoryId: "cat",
  pocketId: null,
  paidBy: "ana",
  counterpartyId: null,
};

describe("normalizeTxEdit", () => {
  it("un gasto completo queda identificado", () => {
    expect(normalizeTxEdit(base, "pendiente")).toMatchObject({ status: "identificado" });
  });

  it("si le quitan la categoría vuelve a pendientes", () => {
    expect(normalizeTxEdit({ ...base, categoryId: null }, "identificado")).toMatchObject({ status: "pendiente" });
  });

  it("un ingreso no necesita categoría", () => {
    expect(normalizeTxEdit({ ...base, kind: "ingreso", categoryId: null }, "pendiente")).toMatchObject({ status: "identificado" });
  });

  it("un ignorado sigue ignorado", () => {
    expect(normalizeTxEdit(base, "ignorado")).toMatchObject({ status: "ignorado" });
  });

  it("una transferencia pierde ámbito, categoría y bolsillo", () => {
    const r = normalizeTxEdit({ ...base, kind: "transferencia_interna", pocketId: "p" }, "pendiente");
    expect(r).toMatchObject({ status: "identificado", value: { scope: null, categoryId: null, pocketId: null } });
  });

  it("el mes del presupuesto igual al de la fecha no se guarda", () => {
    expect(normalizeTxEdit({ ...base, budgetMonth: "2026-11" }, "identificado")).toMatchObject({ value: { budgetMonth: null } });
    expect(normalizeTxEdit({ ...base, budgetMonth: "2026-12" }, "identificado")).toMatchObject({ value: { budgetMonth: "2026-12" } });
  });

  it("una liquidación necesita a otra persona", () => {
    expect(normalizeTxEdit({ ...base, kind: "liquidacion" }, "identificado")).toEqual({ error: "Falta a quién se le pagó" });
    expect(normalizeTxEdit({ ...base, kind: "liquidacion", counterpartyId: "ana" }, "identificado")).toHaveProperty("error");
    expect(normalizeTxEdit({ ...base, kind: "liquidacion", counterpartyId: "luis" }, "identificado")).toMatchObject({
      status: "identificado",
      value: { counterpartyId: "luis", scope: null },
    });
  });

  it("bolsillo sin ámbito es un error", () => {
    expect(normalizeTxEdit({ ...base, scope: null, pocketId: "p" }, "pendiente")).toHaveProperty("error");
  });
});
