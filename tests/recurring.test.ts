import { describe, expect, it } from "vitest";
import { defaultMonth } from "@/domain/dates";
import {
  addMonths,
  dueOccurrences,
  firstOccurrence,
  firstOnOrAfter,
  monthlyEquivalent,
  nextOccurrence,
  upcoming,
  type RecurringSchedule,
} from "@/domain/recurring";

const sched = (p: Partial<RecurringSchedule>): RecurringSchedule => ({
  frequency: "mensual",
  start_date: "2026-01-31",
  end_date: null,
  next_date: "2026-01-31",
  ...p,
});

describe("fechas recurrentes", () => {
  it("mensual el 31 usa el último día en meses cortos y vuelve al 31", () => {
    expect(upcoming(sched({}), 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("año bisiesto", () => {
    expect(addMonths("2028-01-31", 1, 31)).toBe("2028-02-29");
  });

  it("semanal y cada 2 semanas cruzan meses y años", () => {
    expect(nextOccurrence("2026-12-29", "semanal", "2026-12-01")).toBe("2027-01-05");
    expect(nextOccurrence("2026-10-25", "cada_2_semanas", "2026-10-25")).toBe("2026-11-08");
  });

  it("quincenal cae el 15 y el último día del mes", () => {
    const s = sched({ frequency: "quincenal", start_date: "2026-02-03", next_date: firstOccurrence("2026-02-03", "quincenal") });
    expect(upcoming(s, 5)).toEqual(["2026-02-15", "2026-02-28", "2026-03-15", "2026-03-31", "2026-04-15"]);
    expect(nextOccurrence("2026-12-31", "quincenal", "2026-01-15")).toBe("2027-01-15");
  });

  it("bimestral, trimestral y anual", () => {
    expect(nextOccurrence("2026-11-10", "bimestral", "2026-01-10")).toBe("2027-01-10");
    expect(nextOccurrence("2026-11-30", "trimestral", "2026-05-30")).toBe("2027-02-28");
    expect(nextOccurrence("2026-03-05", "anual", "2026-03-05")).toBe("2027-03-05");
  });
});

describe("dueOccurrences", () => {
  it("genera todas las vencidas hasta hoy y calcula la siguiente", () => {
    const r = dueOccurrences(sched({ start_date: "2026-08-05", next_date: "2026-08-05" }), "2026-10-25");
    expect(r.dates).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
    expect(r.nextDate).toBe("2026-11-05");
    expect(r.finished).toBe(false);
  });

  it("no genera nada antes de la fecha", () => {
    const r = dueOccurrences(sched({ start_date: "2026-11-01", next_date: "2026-11-01" }), "2026-10-25");
    expect(r.dates).toEqual([]);
    expect(r.nextDate).toBe("2026-11-01");
  });

  it("respeta la fecha final", () => {
    const r = dueOccurrences(sched({ start_date: "2026-08-05", next_date: "2026-08-05", end_date: "2026-09-30" }), "2026-12-01");
    expect(r.dates).toEqual(["2026-08-05", "2026-09-05"]);
    expect(r.finished).toBe(true);
  });

  it("limita la cantidad si la fecha de inicio es muy vieja", () => {
    const r = dueOccurrences(sched({ frequency: "semanal", start_date: "2020-01-01", next_date: "2020-01-01" }), "2026-10-25", 10);
    expect(r.dates).toHaveLength(10);
  });
});

describe("firstOnOrAfter", () => {
  it("al editar, retoma desde hoy sin volver a generar lo pasado", () => {
    expect(firstOnOrAfter("mensual", "2026-01-10", "2026-10-25")).toBe("2026-11-10");
    expect(firstOnOrAfter("mensual", "2026-01-10", "2026-10-10")).toBe("2026-10-10");
    expect(firstOnOrAfter("mensual", "2026-12-01", "2026-10-25")).toBe("2026-12-01");
  });
});

describe("defaultMonth", () => {
  const oct25 = new Date("2026-10-25T15:00:00Z");
  it("si todavía no llega el mes de inicio, muestra el mes de inicio", () => {
    expect(defaultMonth("2026-11", oct25)).toBe("2026-11");
  });
  it("después del inicio, o sin inicio, muestra el mes actual", () => {
    expect(defaultMonth("2026-09", oct25)).toBe("2026-10");
    expect(defaultMonth(null, oct25)).toBe("2026-10");
  });
});

describe("monthlyEquivalent", () => {
  it("quincenal de 200.000 = 400.000 al mes; semanal ≈ 4,33 semanas", () => {
    expect(monthlyEquivalent(200_000, "quincenal")).toBe(400_000);
    expect(monthlyEquivalent(100_000, "semanal")).toBe(433_333);
    expect(monthlyEquivalent(1_200_000, "anual")).toBe(100_000);
  });
});
