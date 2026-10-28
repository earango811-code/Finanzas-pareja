"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/(app)/actions";
import { monthLabel, monthRange, todayBogota } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { getHousehold } from "@/lib/household";
import { loadCloseData, type ReconciliationInfo } from "@/lib/month-close-data";

const uuid = z.string().uuid();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido");

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(", ") };
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Último día del mes, para registrar los movimientos del cierre dentro del mes que se cierra. */
function closingDate(month: string): string {
  const today = todayBogota();
  const { start, end } = monthRange(month);
  return today >= start && today < end ? today : new Date(Date.parse(`${end}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
}

async function assertOpen(supabase: Awaited<ReturnType<typeof getHousehold>>["supabase"], householdId: string, month: string) {
  const { data } = await supabase.from("month_closes").select("closed_at").eq("household_id", householdId).eq("month", month).maybeSingle<{ closed_at: string | null }>();
  if (data?.closed_at) throw new Error(`${monthLabel(month)} ya está cerrado: reábrelo para hacer cambios`);
}

// ---------------------------------------------------------------------------
// Paso 1: conciliación con el extracto
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().max(200),
  amount: z.number().int().positive().max(100_000_000_000),
  direction: z.enum(["debito", "credito"]),
});

const addLinesSchema = z.object({ accountId: uuid, month: monthSchema, lines: z.array(lineSchema).min(1).max(500) });

/** Lo que está en el extracto y no en la app entra a Pendientes para clasificarlo. */
export async function addStatementTransactions(input: z.input<typeof addLinesSchema>): Promise<ActionResult> {
  try {
    const p = addLinesSchema.parse(input);
    const { supabase, me, accounts } = await getHousehold();
    await assertOpen(supabase, me.household_id, p.month);
    const account = accounts.find((a) => a.id === p.accountId);
    if (!account) throw new Error("Cuenta no encontrada");

    // Huella para no duplicar si se agrega dos veces el mismo extracto
    const seen = new Map<string, number>();
    const rows = p.lines.map((l) => {
      const base = `extracto:${account.id}:${l.date}:${l.direction}:${l.amount}:${l.description.toLowerCase()}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        household_id: me.household_id,
        occurred_on: l.date,
        amount: l.amount,
        merchant: l.description || "Movimiento del extracto",
        raw_description: `Extracto: ${l.description}`,
        account_id: account.id,
        account_last4: account.last4,
        paid_by_member_id: account.owner_member_id,
        source: "csv" as const,
        status: "pendiente" as const,
        kind: l.direction === "credito" ? ("ingreso" as const) : ("gasto" as const),
        dedupe_hash: `${base}:${n}`,
      };
    });
    const { data: existing } = await supabase
      .from("transactions")
      .select("dedupe_hash")
      .eq("household_id", me.household_id)
      .in("dedupe_hash", rows.map((r) => r.dedupe_hash));
    const have = new Set((existing ?? []).map((e) => e.dedupe_hash as string));
    const fresh = rows.filter((r) => !have.has(r.dedupe_hash));
    if (fresh.length) {
      const { error } = await supabase.from("transactions").insert(fresh);
      if (error) throw new Error(error.message);
    }
    refresh();
    return {
      ok: true,
      message: fresh.length
        ? `${fresh.length} movimiento${fresh.length === 1 ? "" : "s"} agregado${fresh.length === 1 ? "" : "s"} a Pendientes`
        : "Ya estaban agregados",
    };
  } catch (e) {
    return fail(e);
  }
}

const reconciledSchema = z.object({
  month: monthSchema,
  accountId: uuid,
  lines: z.number().int().min(0),
  matched: z.number().int().min(0),
  added: z.number().int().min(0),
  removed: z.number().int().min(0),
});

export async function saveReconciliation(input: z.input<typeof reconciledSchema>): Promise<ActionResult> {
  try {
    const p = reconciledSchema.parse(input);
    const { supabase, me, accounts } = await getHousehold();
    if (!accounts.some((a) => a.id === p.accountId)) throw new Error("Cuenta no encontrada");
    await assertOpen(supabase, me.household_id, p.month);
    const { data: current } = await supabase
      .from("month_closes")
      .select("reconciliations")
      .eq("household_id", me.household_id)
      .eq("month", p.month)
      .maybeSingle<{ reconciliations: Record<string, ReconciliationInfo> }>();
    const reconciliations = {
      ...(current?.reconciliations ?? {}),
      [p.accountId]: { at: new Date().toISOString(), lines: p.lines, matched: p.matched, added: p.added, removed: p.removed },
    };
    const { error } = await supabase
      .from("month_closes")
      .upsert({ household_id: me.household_id, month: p.month, reconciliations }, { onConflict: "household_id,month" });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Cuenta conciliada" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Paso 3: saldos de los grupos de ahorro a sus bolsillos
// ---------------------------------------------------------------------------

export async function transferSavingsToPockets(month: string): Promise<ActionResult> {
  try {
    const m = monthSchema.parse(month);
    const ctx = await getHousehold();
    await assertOpen(ctx.supabase, ctx.me.household_id, m);
    const data = await loadCloseData(ctx, m);
    const todo = data.groupCloses.filter((g) => g.remaining > 0);
    if (todo.length === 0) return { ok: true, message: "No hay saldos por pasar" };
    const date = closingDate(m);
    const { error } = await ctx.supabase.from("pocket_movements").insert(
      todo.map((g) => ({
        household_id: ctx.me.household_id,
        pocket_id: g.pocketId,
        kind: "sobrante",
        amount: g.remaining,
        occurred_on: date,
        month: m,
        category_id: g.categoryId,
        note: `Saldo de ${g.groupName}`,
      })),
    );
    if (error) throw new Error(error.message);
    refresh();
    const total = todo.reduce((a, g) => a + g.remaining, 0);
    return { ok: true, message: `${formatCOP(total)} pasados a ${todo.map((g) => g.pocketName).join(", ")}` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Paso 4: cerrar (guarda el ingreso final de cada uno) y reabrir
// ---------------------------------------------------------------------------

export async function closeMonth(month: string): Promise<ActionResult> {
  try {
    const m = monthSchema.parse(month);
    const ctx = await getHousehold();
    const data = await loadCloseData(ctx, m);
    if (data.pendingCount > 0) throw new Error(`Quedan ${data.pendingCount} pendientes de ${monthLabel(m)}: clasifícalos antes de cerrar`);
    const summary = {
      ...data.summary,
      names: Object.fromEntries(ctx.members.map((x) => [x.id, x.display_name])),
      settlement: data.settlement.transfer,
    };
    const { error } = await ctx.supabase
      .from("month_closes")
      .upsert(
        { household_id: ctx.me.household_id, month: m, closed_at: new Date().toISOString(), closed_by: ctx.user.id, summary },
        { onConflict: "household_id,month" },
      );
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: `${monthLabel(m)} cerrado` };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenMonth(month: string): Promise<ActionResult> {
  try {
    const m = monthSchema.parse(month);
    const { supabase, me } = await getHousehold();
    const { error } = await supabase.from("month_closes").update({ closed_at: null, closed_by: null }).eq("household_id", me.household_id).eq("month", m);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Mes reabierto" };
  } catch (e) {
    return fail(e);
  }
}
