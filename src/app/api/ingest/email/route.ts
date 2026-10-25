// Webhook que recibe las alertas de Bancolombia desde el Apps Script de Gmail.
//
// Encabezados: X-Member-Id, X-Timestamp (segundos), X-Signature (ver lib/hmac.ts).
// Cuerpo: { messages: [{ id, date, from, subject, body }] }
// Es idempotente: reenviar el mismo correo no crea duplicados.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { dedupeKey } from "@/domain/dedupe";
import { applyInactiveAccount, classifyIncoming, findAccount, type IngestAccount, type IngestRule, type RecurringCandidate } from "@/domain/ingest";
import { parseBancolombiaEmail } from "@/domain/parsers/bancolombia-email";
import { addDays } from "@/domain/recurring";
import { alertsMasterSecret, deriveMemberKey, sha256, verifySignature } from "@/lib/hmac";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT_PER_MINUTE = 120; // alertas por miembro por minuto
const ALLOWED_SENDER = /@(ayn\.)?notificacionesbancolombia\.com>?$/i;

const payloadSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        date: z.string().max(40).optional(),
        from: z.string().max(320),
        subject: z.string().max(500).optional(),
        body: z.string().max(300_000),
      }),
    )
    .min(1)
    .max(50),
});

type ItemStatus = "creado" | "duplicado" | "no_transaccional" | "formato_desconocido" | "remitente_no_permitido" | "error";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  const master = alertsMasterSecret();
  if (!master || master.length < 32) return json(500, { error: "Servidor sin ALERTS_HMAC_SECRET (mínimo 32 caracteres)" });

  const memberId = req.headers.get("x-member-id") ?? "";
  if (!z.string().uuid().safeParse(memberId).success) return json(401, { error: "No autorizado" });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Demasiado grande" });

  const check = verifySignature({
    key: deriveMemberKey(master, memberId),
    timestamp: req.headers.get("x-timestamp"),
    signature: req.headers.get("x-signature"),
    body: raw,
  });
  if (!check.ok) return json(401, { error: "No autorizado", reason: check.reason });

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(raw));
  } catch {
    return json(400, { error: "Formato inválido" });
  }

  const db = createAdminClient();
  const { data: member } = await db.from("members").select("id, household_id").eq("id", memberId).maybeSingle();
  if (!member) return json(401, { error: "No autorizado" });
  const householdId: string = member.household_id;

  // Límite de solicitudes: alertas registradas por este miembro en el último minuto
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await db
    .from("ingest_log")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .gte("created_at", since);
  if ((recent ?? 0) + payload.messages.length > RATE_LIMIT_PER_MINUTE) {
    return json(429, { error: "Demasiadas solicitudes, intenta en un minuto" });
  }

  const [accountsRes, rulesRes] = await Promise.all([
    db.from("accounts").select("id, owner_member_id, type, last4, card_last4, is_active").eq("household_id", householdId).returns<IngestAccount[]>(),
    db.from("rules").select("id, pattern, scope, category_id, kind, priority, auto_apply").eq("household_id", householdId).returns<IngestRule[]>(),
  ]);
  const accounts = accountsRes.data ?? [];
  const rules = rulesRes.data ?? [];

  const results: { id: string; status: ItemStatus }[] = [];

  for (const msg of payload.messages) {
    // 1) Registrar el correo; si ya existía, es un reenvío y no se procesa otra vez.
    const { data: logRows, error: logErr } = await db
      .from("ingest_log")
      .upsert(
        { household_id: householdId, member_id: memberId, source: "email", message_id: msg.id, status: "recibido" },
        { onConflict: "member_id,message_id", ignoreDuplicates: true },
      )
      .select("id");
    if (logErr) {
      results.push({ id: msg.id, status: "error" });
      continue;
    }
    if (!logRows?.length) {
      results.push({ id: msg.id, status: "duplicado" });
      continue;
    }
    const logId = logRows[0].id as string;
    const finish = async (status: ItemStatus, text: string | null, transactionId: string | null = null) => {
      await db.from("ingest_log").update({ status, text, transaction_id: transactionId }).eq("id", logId);
      results.push({ id: msg.id, status });
    };

    if (!ALLOWED_SENDER.test(msg.from.trim())) {
      await finish("remitente_no_permitido", null);
      continue;
    }

    const parsed = parseBancolombiaEmail(msg.body);
    if (!parsed.ok) {
      await finish(parsed.reason, parsed.text.slice(0, 500));
      continue;
    }
    const m = parsed.movement;

    try {
      const account = findAccount(accounts, memberId, m.account);

      // Recurrentes en Pendientes que podrían ser esta misma alerta (±3 días)
      const { data: recurring } = await db
        .from("transactions")
        .select("id, amount, occurred_on, paid_by_member_id, scope, category_id, kind")
        .eq("household_id", householdId)
        .eq("source", "recurrente")
        .eq("status", "pendiente")
        .eq("amount", m.amount)
        .gte("occurred_on", addDays(m.date, -3))
        .lte("occurred_on", addDays(m.date, 3))
        .returns<RecurringCandidate[]>();

      const c = applyInactiveAccount(classifyIncoming(m, memberId, rules, recurring ?? []), account);
      const hash = sha256(
        dedupeKey({ householdId, date: m.date, amount: m.amount, accountLast4: m.account.last4, merchant: m.merchant, occurredAt: m.occurredAt }),
      );

      const { data: txRows, error: txErr } = await db
        .from("transactions")
        .upsert(
          {
            household_id: householdId,
            occurred_on: m.date,
            occurred_at: m.occurredAt,
            amount: m.amount,
            merchant: m.merchant,
            raw_description: m.text,
            account_id: account?.id ?? null,
            account_last4: m.account.last4,
            paid_by_member_id: memberId,
            source: "email",
            status: c.status,
            scope: c.scope,
            category_id: c.category_id,
            kind: c.kind,
            identified_at: c.status === "identificado" ? new Date().toISOString() : null,
            dedupe_hash: hash,
            notes: c.status === "ignorado" ? "Cuenta desactivada (no cuenta)" : c.appliedRuleId ? "Clasificado por regla" : c.matchedRecurringId ? "Conciliado con recurrente" : null,
            // Solo lo necesario: nunca el cuerpo completo del correo.
            raw_payload: { messageId: msg.id, type: m.type, subject: msg.subject ?? null, text: m.text },
          },
          { onConflict: "household_id,dedupe_hash", ignoreDuplicates: true },
        )
        .select("id");
      if (txErr) throw new Error(txErr.message);
      if (!txRows?.length) {
        await finish("duplicado", m.text);
        continue;
      }
      const txId = txRows[0].id as string;

      if (c.matchedRecurringId) {
        await db
          .from("transactions")
          .update({ status: "ignorado", notes: "Conciliado con la alerta del banco" })
          .eq("id", c.matchedRecurringId);
      }
      if (c.appliedRuleId) {
        const { data: cur } = await db.from("rules").select("hits").eq("id", c.appliedRuleId).single<{ hits: number }>();
        if (cur) await db.from("rules").update({ hits: cur.hits + 1 }).eq("id", c.appliedRuleId);
      }
      await finish("creado", m.text, txId);
    } catch (e) {
      console.error("ingest: error procesando", msg.id, e);
      // Se borra el registro para que el próximo envío del Apps Script lo reintente.
      await db.from("ingest_log").delete().eq("id", logId);
      results.push({ id: msg.id, status: "error" });
    }
  }

  return json(200, { ok: true, results });
}
