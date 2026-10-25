// Genera los movimientos de las recurrentes que ya vencieron. Se llama al abrir la app:
// con dos usuarios no hace falta un cron, y la llave de deduplicación hace que
// llamarlo dos veces (o los dos a la vez) no cree duplicados.
import { todayBogota } from "@/domain/dates";
import { dueOccurrences, recurringDedupeHash, type Frequency } from "@/domain/recurring";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRow } from "@/lib/db-types";

export interface RecurringRow {
  id: string;
  name: string;
  amount: number;
  kind: "gasto" | "ingreso";
  scope: "compartido" | "personal" | null;
  category_id: string | null;
  account_id: string | null;
  paid_by_member_id: string;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  next_date: string;
  auto_identify: boolean;
  is_active: boolean;
}

export async function materializeRecurring(ctx: { supabase: SupabaseClient; me: MemberRow }): Promise<number> {
  const today = todayBogota();
  const { supabase, me } = ctx;
  const { data: due, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("household_id", me.household_id)
    .eq("is_active", true)
    .lte("next_date", today)
    .returns<RecurringRow[]>();
  if (error || !due?.length) return 0;

  let created = 0;
  for (const r of due) {
    const { dates, nextDate, finished } = dueOccurrences(r, today);
    if (dates.length) {
      const complete = r.scope !== null && (r.category_id !== null || r.kind === "ingreso");
      const rows = dates.map((date) => ({
        household_id: me.household_id,
        occurred_on: date,
        amount: r.amount,
        merchant: r.name,
        kind: r.kind,
        scope: r.scope,
        category_id: r.category_id,
        account_id: r.account_id,
        paid_by_member_id: r.paid_by_member_id,
        source: "recurrente",
        status: r.auto_identify && complete ? "identificado" : "pendiente",
        recurring_id: r.id,
        dedupe_hash: recurringDedupeHash(r.id, date),
      }));
      const { error: insErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "household_id,dedupe_hash", ignoreDuplicates: true });
      if (insErr) {
        console.error("recurrentes: no se pudo generar", r.id, insErr.message);
        continue; // no avanzar la fecha: se reintenta la próxima vez
      }
      created += rows.length;
    }
    await supabase
      .from("recurring_transactions")
      .update(finished ? { next_date: nextDate, is_active: false } : { next_date: nextDate })
      .eq("id", r.id)
      .eq("next_date", r.next_date); // si el otro ya la avanzó, no pisar
  }
  return created;
}
