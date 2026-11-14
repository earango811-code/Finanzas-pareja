// Ingresos variables: cada mes puede tener su propio ingreso por persona.
import type { Member } from "./types";

export interface MonthIncomeRow {
  member_id: string;
  month: string; // YYYY-MM
  monthly_income: number;
  income_deductions: number;
  deductions_note: string | null;
}

export interface MemberWithMonthIncome extends Member {
  deductions_note: string | null;
  /** Mes del que sale el ingreso (el mismo mes, o el último anterior con registro). null = el de la ficha del miembro. */
  incomeFrom: string | null;
}

/**
 * Ingreso de cada uno para `month`: el registro de ese mes o, si no hay, el del último mes
 * anterior que tenga (así un mes nuevo arranca con los ingresos del anterior). Si no hay
 * ninguno, el de la ficha del miembro.
 */
export function resolveMonthIncomes<M extends Member & { deductions_note?: string | null }>(
  members: M[],
  rows: MonthIncomeRow[],
  month: string,
): (M & MemberWithMonthIncome)[] {
  return members.map((m) => {
    const row = rows
      .filter((r) => r.member_id === m.id && r.month <= month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    if (!row) return { ...m, deductions_note: m.deductions_note ?? null, incomeFrom: null };
    return {
      ...m,
      monthly_income: row.monthly_income,
      income_deductions: row.income_deductions,
      deductions_note: row.deductions_note,
      incomeFrom: row.month,
    };
  });
}
