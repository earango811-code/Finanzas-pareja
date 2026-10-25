"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayBogota } from "@/domain/dates";
import { pocketFitsTx } from "@/domain/pockets";
import { firstOccurrence, firstOnOrAfter, type Frequency } from "@/domain/recurring";
import { rulePatternFor } from "@/domain/rules";
import { getHousehold } from "@/lib/household";
import { isWeakPin, normalizeEmail, PIN_REGEX, pinToPassword } from "@/lib/pin";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const pesos = z.coerce.number().int().min(0).max(100_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(", ") };
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function refresh() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Bandeja de pendientes
// ---------------------------------------------------------------------------

const classifySchema = z.object({
  ids: z.array(uuid).min(1).max(200),
  scope: z.enum(["compartido", "personal"]),
  categoryId: uuid,
  remember: z.boolean().default(false),
  pocketId: uuid.nullable().default(null), // "pagado desde este bolsillo"
});

/** Valida que los movimientos se puedan pagar desde el bolsillo (mismo ámbito y dueño). */
async function assertPocketFits(
  supabase: Awaited<ReturnType<typeof getHousehold>>["supabase"],
  pocketId: string,
  txs: { scope: "compartido" | "personal" | null; paid_by_member_id: string }[],
) {
  const { data: pocket } = await supabase.from("pockets").select("owner_member_id, name").eq("id", pocketId).single<{ owner_member_id: string | null; name: string }>();
  if (!pocket) throw new Error("Bolsillo no encontrado");
  const bad = txs.find((t) => !pocketFitsTx(pocket.owner_member_id, t));
  if (bad) {
    throw new Error(
      pocket.owner_member_id === null
        ? `"${pocket.name}" es compartido: solo sirve para gastos compartidos`
        : `"${pocket.name}" es personal: solo sirve para gastos personales de su dueño`,
    );
  }
}

export async function classifyTransactions(input: z.input<typeof classifySchema>): Promise<ActionResult> {
  try {
    const p = classifySchema.parse(input);
    const { supabase, me, user } = await getHousehold();

    if (p.pocketId) {
      const { data: current } = await supabase.from("transactions").select("paid_by_member_id").in("id", p.ids);
      await assertPocketFits(supabase, p.pocketId, (current ?? []).map((t) => ({ scope: p.scope, paid_by_member_id: t.paid_by_member_id as string })));
    }

    const { data: txs, error } = await supabase
      .from("transactions")
      .update({
        status: "identificado",
        scope: p.scope,
        category_id: p.categoryId,
        pocket_id: p.pocketId,
        identified_by: user.id,
        identified_at: new Date().toISOString(),
      })
      .in("id", p.ids)
      .select("merchant, kind");
    if (error) throw new Error(error.message);

    // Los ingresos conservan su tipo; todo lo demás clasificado aquí es gasto.
    await supabase.from("transactions").update({ kind: "gasto" }).in("id", p.ids).not("kind", "eq", "ingreso");

    if (p.remember) {
      const patterns = [...new Set((txs ?? []).map((t) => t.merchant && rulePatternFor(t.merchant)).filter(Boolean))];
      for (const pattern of patterns) {
        await supabase.from("rules").upsert(
          { household_id: me.household_id, pattern, scope: p.scope, category_id: p.categoryId, kind: "gasto" },
          { onConflict: "household_id,pattern" },
        );
      }
    }
    refresh();
    return { ok: true, message: p.ids.length > 1 ? `${p.ids.length} movimientos clasificados` : "Clasificado" };
  } catch (e) {
    return fail(e);
  }
}

const markSchema = z.object({
  ids: z.array(uuid).min(1).max(200),
  kind: z.enum(["transferencia_interna", "pago_tarjeta"]),
});

/** Transferencias internas y pagos de tarjeta: no cuentan como gasto. */
export async function markAsTransfer(input: z.input<typeof markSchema>): Promise<ActionResult> {
  try {
    const p = markSchema.parse(input);
    const { supabase, user } = await getHousehold();
    const { error } = await supabase
      .from("transactions")
      .update({ status: "identificado", kind: p.kind, scope: null, category_id: null, identified_by: user.id, identified_at: new Date().toISOString() })
      .in("id", p.ids);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Marcado como no-gasto" };
  } catch (e) {
    return fail(e);
  }
}

export async function ignoreTransactions(ids: string[]): Promise<ActionResult> {
  try {
    const p = z.array(uuid).min(1).max(200).parse(ids);
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("transactions").update({ status: "ignorado" }).in("id", p);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Ignorado" };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenTransaction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase
      .from("transactions")
      .update({ status: "pendiente", identified_by: null, identified_at: null })
      .eq("id", uuid.parse(id))
      .neq("kind", "liquidacion");
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Devuelto a pendientes" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteManualTransaction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    // Solo se borran los registrados a mano, recurrentes o liquidaciones; lo del banco se ignora.
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", uuid.parse(id))
      .in("source", ["manual", "recurrente"]);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Eliminado" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Registro manual
// ---------------------------------------------------------------------------

const manualSchema = z.object({
  amount: pesos.refine((n) => n > 0, "El valor debe ser mayor a 0"),
  date: isoDate,
  merchant: z.string().trim().max(120).default(""),
  kind: z.enum(["gasto", "ingreso"]).default("gasto"),
  scope: z.enum(["compartido", "personal"]).nullable(),
  categoryId: uuid.nullable(),
  accountId: uuid.nullable(),
  paidBy: uuid,
  rawText: z.string().max(300).optional(),
  pocketId: uuid.nullable().default(null),
});

export async function createManualTransaction(input: z.input<typeof manualSchema>): Promise<ActionResult> {
  try {
    const p = manualSchema.parse(input);
    const { supabase, me, members } = await getHousehold();
    if (!members.some((m) => m.id === p.paidBy)) throw new Error("Miembro inválido");
    const complete = p.scope !== null && (p.categoryId !== null || p.kind === "ingreso");
    if (p.pocketId) await assertPocketFits(supabase, p.pocketId, [{ scope: p.scope, paid_by_member_id: p.paidBy }]);
    const { error } = await supabase.from("transactions").insert({
      pocket_id: p.pocketId,
      household_id: me.household_id,
      occurred_on: p.date,
      amount: p.amount,
      merchant: p.merchant || null,
      raw_description: p.rawText ?? null,
      kind: p.kind,
      scope: p.scope,
      category_id: p.categoryId,
      account_id: p.accountId,
      paid_by_member_id: p.paidBy,
      source: "manual",
      status: complete ? "identificado" : "pendiente",
    });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: complete ? "Registrado" : "Registrado en pendientes" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Liquidación entre nosotros
// ---------------------------------------------------------------------------

const settleSchema = z.object({ from: uuid, to: uuid, amount: pesos.refine((n) => n > 0), date: isoDate });

export async function registerSettlement(input: z.input<typeof settleSchema>): Promise<ActionResult> {
  try {
    const p = settleSchema.parse(input);
    const { supabase, me, members } = await getHousehold();
    if (p.from === p.to || ![p.from, p.to].every((id) => members.some((m) => m.id === id))) {
      throw new Error("Miembros inválidos");
    }
    const { error } = await supabase.from("transactions").insert({
      household_id: me.household_id,
      occurred_on: p.date,
      amount: p.amount,
      merchant: "Liquidación entre nosotros",
      kind: "liquidacion",
      paid_by_member_id: p.from,
      counterparty_member_id: p.to,
      source: "manual",
      status: "identificado",
    });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Liquidación registrada" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const memberSchema = z.object({
  id: uuid,
  display_name: z.string().trim().min(1).max(40),
  monthly_income: pesos,
  income_deductions: pesos,
  deductions_note: z.string().trim().max(120).nullable(),
});

export async function updateMember(input: z.input<typeof memberSchema>): Promise<ActionResult> {
  try {
    const p = memberSchema.parse(input);
    const { supabase } = await getHousehold();
    const { id, ...fields } = p;
    const { error } = await supabase.from("members").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Guardado" };
  } catch (e) {
    return fail(e);
  }
}

const last4Schema = z.string().regex(/^\d{4}$/, "Solo los últimos 4 dígitos").nullable();
const accountSchema = z.object({
  owner_member_id: uuid,
  name: z.string().trim().min(1).max(60),
  type: z.enum(["debito", "credito", "efectivo", "otro"]),
  last4: last4Schema,
  card_last4: last4Schema.default(null),
});

/**
 * Enlaza con la cuenta los movimientos que llegaron por alerta antes de registrarla
 * (quedaron con account_last4 y sin cuenta).
 */
async function linkOrphanTransactions(
  supabase: Awaited<ReturnType<typeof getHousehold>>["supabase"],
  householdId: string,
  account: { id: string; owner_member_id: string; type: string; last4: string | null; card_last4: string | null },
) {
  const digits = [account.last4, account.type === "credito" ? null : account.card_last4].filter(Boolean) as string[];
  if (!digits.length) return 0;
  const { data } = await supabase
    .from("transactions")
    .update({ account_id: account.id })
    .eq("household_id", householdId)
    .eq("paid_by_member_id", account.owner_member_id)
    .is("account_id", null)
    .in("account_last4", digits)
    .select("id");
  return data?.length ?? 0;
}

export async function addAccount(input: z.input<typeof accountSchema>): Promise<ActionResult> {
  try {
    const p = accountSchema.parse(input);
    const { supabase, me, members } = await getHousehold();
    if (!members.some((m) => m.id === p.owner_member_id)) throw new Error("Dueño inválido");
    const { data, error } = await supabase
      .from("accounts")
      .insert({ ...p, card_last4: p.type === "debito" ? p.card_last4 : null, household_id: me.household_id })
      .select("id, owner_member_id, type, last4, card_last4")
      .single();
    if (error) throw new Error(error.message);
    const linked = await linkOrphanTransactions(supabase, me.household_id, data);
    refresh();
    return { ok: true, message: linked ? `Cuenta agregada; ${linked} movimientos enlazados` : "Cuenta agregada" };
  } catch (e) {
    return fail(e);
  }
}

const accountUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(60),
  last4: last4Schema,
  card_last4: last4Schema,
});

export async function updateAccount(input: z.input<typeof accountUpdateSchema>): Promise<ActionResult> {
  try {
    const p = accountUpdateSchema.parse(input);
    const { supabase, me, accounts } = await getHousehold();
    const current = accounts.find((a) => a.id === p.id);
    if (!current) throw new Error("Cuenta no encontrada");
    const fields = { name: p.name, last4: p.last4, card_last4: current.type === "debito" ? p.card_last4 : null };
    const { error } = await supabase.from("accounts").update(fields).eq("id", p.id);
    if (error) throw new Error(error.message);
    const linked = await linkOrphanTransactions(supabase, me.household_id, { ...current, ...fields });
    refresh();
    return { ok: true, message: linked ? `Guardada; ${linked} movimientos enlazados` : "Guardada" };
  } catch (e) {
    return fail(e);
  }
}

export async function setAccountActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("accounts").update({ is_active: active }).eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const budgetSchema = z.object({
  categoryId: uuid,
  memberId: uuid.nullable(),
  mode: z.enum(["fijo", "resto"]),
  amount: pesos,
  remainderShare: z.coerce.number().min(0).max(1),
});

export async function saveBudget(input: z.input<typeof budgetSchema>): Promise<ActionResult> {
  try {
    const p = budgetSchema.parse(input);
    const { supabase, me } = await getHousehold();
    let q = supabase.from("budgets").select("id").eq("category_id", p.categoryId);
    q = p.memberId ? q.eq("member_id", p.memberId) : q.is("member_id", null);
    const { data: existing } = await q.maybeSingle();
    const fields = { mode: p.mode, amount: p.amount, remainder_share: p.remainderShare };
    const { error } = existing
      ? await supabase.from("budgets").update(fields).eq("id", existing.id)
      : await supabase.from("budgets").insert({ ...fields, household_id: me.household_id, category_id: p.categoryId, member_id: p.memberId });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Presupuesto guardado" };
  } catch (e) {
    return fail(e);
  }
}

export async function removeBudget(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("budgets").delete().eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  scope: z.enum(["compartida", "personal", "ambas"]),
  budget_group: z.enum(["necesidades", "deseos", "ahorro"]),
  parent_id: uuid.nullable().default(null),
});

export async function addCategory(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  try {
    const p = categorySchema.parse(input);
    const { supabase, me, categories } = await getHousehold();
    let row: Record<string, unknown> = { ...p, household_id: me.household_id, sort_order: 100 };
    if (p.parent_id) {
      // La subcategoría hereda ámbito, grupo y tipo de su principal
      const parent = categories.find((c) => c.id === p.parent_id && !c.parent_id);
      if (!parent) throw new Error("Categoría principal inválida");
      row = {
        ...row,
        scope: parent.scope,
        budget_group: parent.budget_group,
        is_income: parent.is_income,
        sort_order: parent.sort_order * 100 + 99,
      };
    }
    const { error } = await supabase.from("categories").insert(row);
    if (error) throw new Error(error.code === "23505" ? "Ya existe una categoría con ese nombre" : error.message);
    refresh();
    return { ok: true, message: "Categoría creada" };
  } catch (e) {
    return fail(e);
  }
}

export async function setRuleAutoApply(id: string, autoApply: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("rules").update({ auto_apply: autoApply }).eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: autoApply ? "Se clasificará sola" : "Solo sugerirá" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRule(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("rules").delete().eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Regla eliminada" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// PIN de entrada
// ---------------------------------------------------------------------------

const pinSchema = z.object({
  pin: z.string().regex(PIN_REGEX, "El PIN son 4 números"),
  confirm: z.string(),
});

function checkPin(p: z.infer<typeof pinSchema>) {
  if (p.pin !== p.confirm) throw new Error("Los dos PIN no coinciden");
  if (isWeakPin(p.pin)) throw new Error("Ese PIN es muy fácil de adivinar (ej. 1234, 0000). Elige otro");
  const secret = process.env.INGEST_HMAC_SECRET;
  if (!secret) throw new Error("Falta INGEST_HMAC_SECRET en el servidor");
  return secret;
}

/** Crea o cambia mi PIN. */
export async function setMyPin(input: z.input<typeof pinSchema>): Promise<ActionResult> {
  try {
    const p = pinSchema.parse(input);
    const secret = checkPin(p);
    const { user, me } = await getHousehold();
    if (!user.email) throw new Error("Tu usuario no tiene correo");
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: pinToPassword(secret, user.email, p.pin) });
    if (error) throw new Error(error.message);
    await admin.from("members").update({ pin_set_at: new Date().toISOString() }).eq("id", me.id);
    await admin.from("login_attempts").delete().eq("email", normalizeEmail(user.email));
    refresh();
    return { ok: true, message: "PIN guardado. Ya puedes entrar con correo + PIN" };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Crea el acceso de la pareja (o le restablece el PIN si lo olvidó). Solo lo puede
 * hacer un miembro del mismo hogar; la pareja puede cambiarlo después en su Ajustes.
 */
export async function setPartnerPin(input: z.input<typeof pinSchema>): Promise<ActionResult> {
  try {
    const p = pinSchema.parse(input);
    const secret = checkPin(p);
    const { partner } = await getHousehold();
    if (!partner) throw new Error("No hay pareja en el hogar");
    const email = normalizeEmail(partner.email);
    const password = pinToPassword(secret, email, p.pin);
    const admin = createAdminClient();

    let userId = partner.user_id;
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error(error.message);
    } else {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        // Ya existe (entró alguna vez con enlace pero no quedó vinculada): buscarla
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users.find((u) => normalizeEmail(u.email ?? "") === email);
        if (!existing) throw new Error(created.error.message);
        const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
        if (error) throw new Error(error.message);
        userId = existing.id;
      } else {
        userId = created.data.user.id;
      }
      const { error: linkErr } = await admin.from("members").update({ user_id: userId }).eq("id", partner.id).is("user_id", null);
      if (linkErr) throw new Error(linkErr.message);
    }
    await admin.from("members").update({ pin_set_at: new Date().toISOString() }).eq("id", partner.id);
    await admin.from("login_attempts").delete().eq("email", email);
    refresh();
    return { ok: true, message: `Listo: ${partner.display_name} entra con ${email} y ese PIN` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Editar categorías
// ---------------------------------------------------------------------------

const categoryUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "El nombre no puede quedar vacío").max(50),
  parent_id: uuid.nullable(),
  scope: z.enum(["compartida", "personal", "ambas"]),
  budget_group: z.enum(["necesidades", "deseos", "ahorro"]).nullable(),
  aliases: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30),
});

export async function updateCategory(input: z.input<typeof categoryUpdateSchema>): Promise<ActionResult> {
  try {
    const p = categoryUpdateSchema.parse(input);
    const { supabase, allCategories } = await getHousehold();
    const current = allCategories.find((c) => c.id === p.id);
    if (!current) throw new Error("Categoría no encontrada");
    const children = allCategories.filter((c) => c.parent_id === p.id);

    let fields: Record<string, unknown> = { name: p.name, aliases: [...new Set(p.aliases)] };

    if (p.parent_id) {
      const parent = allCategories.find((c) => c.id === p.parent_id);
      if (!parent || parent.parent_id || parent.id === p.id) throw new Error("Elige una categoría principal válida");
      if (children.length) {
        throw new Error("Esta categoría tiene subcategorías: muévelas o elimínalas antes de convertirla en subcategoría");
      }
      const { count } = await supabase.from("budgets").select("id", { count: "exact", head: true }).eq("category_id", p.id);
      if (count) throw new Error("Tiene presupuesto asignado: quítalo antes de convertirla en subcategoría");
      // La subcategoría hereda de su principal
      fields = { ...fields, parent_id: parent.id, scope: parent.scope, budget_group: parent.budget_group, is_income: parent.is_income };
    } else {
      if (!current.is_income && !p.budget_group) throw new Error("Elige el grupo (Necesidades, Deseos o Ahorro)");
      fields = { ...fields, parent_id: null, scope: p.scope, budget_group: current.is_income ? null : p.budget_group };
    }

    const { error } = await supabase.from("categories").update(fields).eq("id", p.id);
    if (error) throw new Error(error.code === "23505" ? "Ya existe una categoría con ese nombre" : error.message);

    // Las subcategorías siguen a su principal
    if (!p.parent_id && children.length) {
      await supabase.from("categories").update({ scope: fields.scope, budget_group: fields.budget_group }).eq("parent_id", p.id);
    }
    refresh();
    return { ok: true, message: "Categoría actualizada" };
  } catch (e) {
    return fail(e);
  }
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase, allCategories } = await getHousehold();
    const cid = uuid.parse(id);
    // Desactivar una principal desactiva sus subcategorías; activar una subcategoría activa su principal.
    const { error } = await supabase.from("categories").update({ is_active: active }).or(`id.eq.${cid},parent_id.eq.${cid}`);
    if (error) throw new Error(error.message);
    const parentId = allCategories.find((c) => c.id === cid)?.parent_id;
    if (active && parentId) await supabase.from("categories").update({ is_active: true }).eq("id", parentId);
    refresh();
    return { ok: true, message: active ? "Categoría activada" : "Desactivada: ya no aparece al clasificar" };
  } catch (e) {
    return fail(e);
  }
}

const categoryDeleteSchema = z.object({ id: uuid, reassignTo: uuid.nullable() });

/**
 * Elimina una categoría. Si tiene movimientos, hay que elegir a cuál pasarlos
 * (también se pasan sus reglas y recurrentes).
 */
export async function deleteCategory(input: z.input<typeof categoryDeleteSchema>): Promise<ActionResult> {
  try {
    const p = categoryDeleteSchema.parse(input);
    const { supabase, allCategories } = await getHousehold();
    if (!allCategories.some((c) => c.id === p.id)) throw new Error("Categoría no encontrada");
    if (allCategories.some((c) => c.parent_id === p.id)) throw new Error("Primero elimina o mueve sus subcategorías");
    const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", p.id);

    if (p.reassignTo) {
      if (p.reassignTo === p.id || !allCategories.some((c) => c.id === p.reassignTo)) throw new Error("Categoría destino inválida");
      for (const table of ["transactions", "recurring_transactions", "rules"] as const) {
        const { error } = await supabase.from(table).update({ category_id: p.reassignTo }).eq("category_id", p.id);
        if (error) throw new Error(error.message);
      }
    } else if (count) {
      throw new Error(`Tiene ${count} movimientos: elige a qué categoría pasarlos, o desactívala`);
    }

    const { error } = await supabase.from("categories").delete().eq("id", p.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: p.reassignTo && count ? `Eliminada; ${count} movimientos movidos` : "Categoría eliminada" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Transacciones recurrentes
// ---------------------------------------------------------------------------

const recurringSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  amount: pesos.refine((n) => n > 0, "El valor debe ser mayor a 0"),
  kind: z.enum(["gasto", "ingreso"]),
  scope: z.enum(["compartido", "personal"]).nullable(),
  categoryId: uuid.nullable(),
  accountId: uuid.nullable(),
  paidBy: uuid,
  frequency: z.enum(["semanal", "cada_2_semanas", "quincenal", "mensual", "bimestral", "trimestral", "anual"]),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  autoIdentify: z.boolean(),
});

export async function saveRecurring(input: z.input<typeof recurringSchema>): Promise<ActionResult> {
  try {
    const p = recurringSchema.parse(input);
    if (p.endDate && p.endDate < p.startDate) throw new Error("La fecha final es anterior al inicio");
    const { supabase, me, members } = await getHousehold();
    if (!members.some((m) => m.id === p.paidBy)) throw new Error("Miembro inválido");

    const fields = {
      name: p.name,
      amount: p.amount,
      kind: p.kind,
      scope: p.scope,
      category_id: p.categoryId,
      account_id: p.accountId,
      paid_by_member_id: p.paidBy,
      frequency: p.frequency,
      start_date: p.startDate,
      end_date: p.endDate,
      auto_identify: p.autoIdentify,
    };

    if (!p.id) {
      // Nueva: si el inicio ya pasó, se generan las ocurrencias desde el inicio.
      const { error } = await supabase.from("recurring_transactions").insert({
        ...fields,
        household_id: me.household_id,
        next_date: firstOccurrence(p.startDate, p.frequency),
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: prev } = await supabase
        .from("recurring_transactions")
        .select("frequency, start_date, next_date")
        .eq("id", p.id)
        .single<{ frequency: Frequency; start_date: string; next_date: string }>();
      if (!prev) throw new Error("Recurrente no encontrada");
      // Si cambia el calendario, retoma desde hoy: lo ya generado no se repite.
      const scheduleChanged = prev.frequency !== p.frequency || prev.start_date !== p.startDate;
      const next_date = scheduleChanged ? firstOnOrAfter(p.frequency, p.startDate, todayBogota()) : prev.next_date;
      const { error } = await supabase.from("recurring_transactions").update({ ...fields, next_date }).eq("id", p.id);
      if (error) throw new Error(error.message);
    }
    refresh();
    return { ok: true, message: p.id ? "Recurrente actualizada" : "Recurrente programada" };
  } catch (e) {
    return fail(e);
  }
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const rid = uuid.parse(id);
    let fields: Record<string, unknown> = { is_active: active };
    if (active) {
      // Al reanudar no se generan las ocurrencias del tiempo en pausa.
      const { data } = await supabase
        .from("recurring_transactions")
        .select("frequency, start_date")
        .eq("id", rid)
        .single<{ frequency: Frequency; start_date: string }>();
      if (data) fields = { ...fields, next_date: firstOnOrAfter(data.frequency, data.start_date, todayBogota()) };
    }
    const { error } = await supabase.from("recurring_transactions").update(fields).eq("id", rid);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: active ? "Reanudada" : "En pausa" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    // Los movimientos ya generados se conservan.
    const { error } = await supabase.from("recurring_transactions").delete().eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Eliminada (los movimientos ya creados se conservan)" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Bolsillos
// ---------------------------------------------------------------------------

const pocketSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1, "Ponle un nombre").max(40),
  ownerMemberId: uuid.nullable(), // null = compartido
  targetAmount: pesos.nullable(),
  openingBalance: pesos.default(0),
});

export async function savePocket(input: z.input<typeof pocketSchema>): Promise<ActionResult> {
  try {
    const p = pocketSchema.parse(input);
    const { supabase, me, members } = await getHousehold();
    if (p.ownerMemberId && !members.some((m) => m.id === p.ownerMemberId)) throw new Error("Dueño inválido");
    const fields = {
      name: p.name,
      owner_member_id: p.ownerMemberId,
      target_amount: p.targetAmount && p.targetAmount > 0 ? p.targetAmount : null,
      opening_balance: p.openingBalance,
    };
    const { error } = p.id
      ? await supabase.from("pockets").update(fields).eq("id", p.id)
      : await supabase.from("pockets").insert({ ...fields, household_id: me.household_id });
    if (error) throw new Error(error.code === "23505" ? "Ya existe un bolsillo con ese nombre" : error.message);
    refresh();
    return { ok: true, message: p.id ? "Bolsillo actualizado" : "Bolsillo creado" };
  } catch (e) {
    return fail(e);
  }
}

export async function setPocketActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("pockets").update({ is_active: active }).eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: active ? "Bolsillo activado" : "Bolsillo archivado (su historial se conserva)" };
  } catch (e) {
    return fail(e);
  }
}

const movementSchema = z.object({
  pocketId: uuid,
  kind: z.enum(["aporte", "sobrante", "retiro"]),
  amount: pesos.refine((n) => n > 0, "El valor debe ser mayor a 0"),
  date: isoDate,
  month: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
  note: z.string().trim().max(120).nullable().default(null),
});

/** Aporte, retiro o paso del sobrante de un mes a un bolsillo. */
export async function addPocketMovement(input: z.input<typeof movementSchema>): Promise<ActionResult> {
  try {
    const p = movementSchema.parse(input);
    if (p.kind === "sobrante" && !p.month) throw new Error("Falta el mes del sobrante");
    const { supabase, me } = await getHousehold();
    const { error } = await supabase.from("pocket_movements").insert({
      household_id: me.household_id,
      pocket_id: p.pocketId,
      kind: p.kind,
      amount: p.amount,
      occurred_on: p.date,
      month: p.kind === "sobrante" ? p.month : null,
      note: p.note,
    });
    if (error) throw new Error(error.message);
    refresh();
    const verb = p.kind === "retiro" ? "Retiro registrado" : p.kind === "sobrante" ? "Sobrante pasado al bolsillo" : "Aporte registrado";
    return { ok: true, message: verb };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePocketMovement(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const { error } = await supabase.from("pocket_movements").delete().eq("id", uuid.parse(id));
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: "Movimiento eliminado" };
  } catch (e) {
    return fail(e);
  }
}

/** Marca (o desmarca con null) un movimiento ya identificado como pagado desde un bolsillo. */
export async function setTransactionPocket(txId: string, pocketId: string | null): Promise<ActionResult> {
  try {
    const { supabase } = await getHousehold();
    const id = uuid.parse(txId);
    const { data: tx } = await supabase
      .from("transactions")
      .select("scope, paid_by_member_id, kind")
      .eq("id", id)
      .single<{ scope: "compartido" | "personal" | null; paid_by_member_id: string; kind: string }>();
    if (!tx) throw new Error("Movimiento no encontrado");
    if (pocketId) {
      if (tx.kind !== "gasto" && tx.kind !== "ingreso") throw new Error("Solo gastos o devoluciones se pagan desde un bolsillo");
      await assertPocketFits(supabase, uuid.parse(pocketId), [tx]);
    }
    const { error } = await supabase.from("transactions").update({ pocket_id: pocketId }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, message: pocketId ? "Pagado desde el bolsillo: ya no cuenta en el presupuesto del mes" : "Vuelve a contar en el presupuesto del mes" };
  } catch (e) {
    return fail(e);
  }
}
