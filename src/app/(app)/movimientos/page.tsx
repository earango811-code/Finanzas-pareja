import { PageHeader } from "@/components/page-header";
import { TxActions } from "@/components/tx-actions";
import { currentMonth, isValidMonth, monthRange, shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { KIND_LABEL } from "@/domain/types";
import { TX_COLUMNS, type TransactionRow } from "@/lib/db-types";
import { categoryLabel } from "@/lib/categories";
import { getHousehold, memberName } from "@/lib/household";

export const metadata = { title: "Movimientos" };

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "compartido", label: "Compartido" },
  { key: "personal", label: "Personal" },
  { key: "otros", label: "No-gasto" },
  { key: "ignorado", label: "Ignorados" },
] as const;

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ mes?: string; f?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonth(sp.mes) ? sp.mes : currentMonth();
  const filter = FILTERS.some((f) => f.key === sp.f) ? sp.f! : "todos";
  const ctx = await getHousehold();
  const { supabase, me, allCategories, accounts } = ctx;
  const { start, end } = monthRange(month);

  let q = supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("household_id", me.household_id)
    .gte("occurred_on", start)
    .lt("occurred_on", end)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter === "ignorado") q = q.eq("status", "ignorado");
  else {
    q = q.eq("status", "identificado");
    if (filter === "compartido" || filter === "personal") q = q.eq("scope", filter);
    if (filter === "otros") q = q.in("kind", ["transferencia_interna", "pago_tarjeta", "liquidacion"]);
  }
  const { data } = await q.returns<TransactionRow[]>();
  const txs = data ?? [];
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const acctName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader title="Movimientos" month={month} basePath="/movimientos" />
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {FILTERS.map((f) => (
          <a key={f.key} href={`/movimientos?mes=${month}&f=${f.key}`} className="chip shrink-0" data-active={filter === f.key}>
            {f.label}
          </a>
        ))}
      </div>

      {txs.length === 0 ? (
        <p className="muted px-4 py-16 text-center text-sm">No hay movimientos en este filtro.</p>
      ) : (
        <ul className="card mx-4 divide-y divide-[var(--line)]">
          {txs.map((t) => {
            const label =
              t.kind === "gasto" || (t.kind === "ingreso" && t.category_id)
                ? `${categoryLabel(t.category_id, catById)} · ${t.scope}`
                : KIND_LABEL[t.kind];
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.merchant ?? "Sin descripción"}</p>
                  <p className="muted truncate text-xs">
                    {shortDate(t.occurred_on)} · {label} · {memberName(ctx, t.paid_by_member_id)}
                    {t.kind === "liquidacion" && ` → ${memberName(ctx, t.counterparty_member_id)}`}
                    {t.account_id && ` · ${acctName.get(t.account_id)}`}
                  </p>
                </div>
                <p className={`tabular text-sm font-semibold ${t.kind === "ingreso" ? "text-emerald-600" : ""}`}>
                  {t.kind === "ingreso" ? "+" : ""}
                  {formatCOP(t.amount)}
                </p>
                <TxActions id={t.id} canReopen={t.kind !== "liquidacion"} canDelete={t.source === "manual" || t.source === "recurrente"} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
