import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "@/domain/quick-entry";

const cats = [
  { id: "mer", name: "Mercado" },
  { id: "sal", name: "Salidas", aliases: ["restaurante", "comida"] },
  { id: "tra", name: "Transporte / gasolina", aliases: ["uber", "taxi"] },
  { id: "lic", name: "Licor y chasers" },
];
const accts = [
  { id: "efe", name: "Efectivo", type: "efectivo" },
  { id: "tc", name: "TC", type: "credito" },
];

describe("parseQuickEntry", () => {
  it("45 mil mercado D1 compartido", () => {
    expect(parseQuickEntry("45 mil mercado D1 compartido", cats)).toMatchObject({
      amount: 45000,
      categoryId: "mer",
      scope: "compartido",
      merchant: "D1",
      dayOffset: 0,
    });
  });

  it("45k, 1,2 millones, $45.000, 1.5M", () => {
    expect(parseQuickEntry("45k taxi", cats).amount).toBe(45000);
    expect(parseQuickEntry("1,2 millones viaje", cats).amount).toBe(1_200_000);
    expect(parseQuickEntry("$45.000 uber", cats).amount).toBe(45000);
    expect(parseQuickEntry("1.5M arriendo", cats).amount).toBe(1_500_000);
  });

  it("detecta ayer, personal, efectivo y alias de categoría", () => {
    expect(parseQuickEntry("ayer 30 mil uber personal efectivo", cats, accts)).toMatchObject({
      amount: 30000,
      dayOffset: -1,
      scope: "personal",
      categoryId: "tra",
      accountId: "efe",
    });
  });

  it("sin tildes ni mayúsculas", () => {
    expect(parseQuickEntry("20 MIL LICOR Milenium", cats)).toMatchObject({ categoryId: "lic", merchant: "Milenium" });
  });

  it("sin categoría reconocida deja el texto como comercio", () => {
    expect(parseQuickEntry("12000 ferretería el tornillo", cats)).toMatchObject({
      amount: 12000,
      categoryId: null,
      merchant: "ferretería tornillo",
    });
  });
});
