import { PageHeader } from "@/components/page-header";
import { TxActions } from "@/components/tx-actions";
import { currentMonth, defaultMonth, isValidMonth, monthLabel, shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { pocketFitsTx } from "@/domain/pockets";
import { KIND_LABEL } from "@/domain/types";
import { TX_COLUMNS, type TransactionRow } from "@/lib/db-types";
import { CatIcon } from "@/components/cat-icon";
import { visualFor } from "@/lib/visual";
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
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth((await getHousehold()).household.start_month);
  const filter = FILTERS.some((f) => f.key === sp.f) ? sp.f! : "todos";
  const ctx = await getHousehold();
  const { supabase, me, allCategories, accounts } = ctx;


  let q = supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("household_id", me.household_id)
    .eq("month", month)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter === "ignorado") q = q.eq("status", "ignorado");
  else {
    q = q.eq("status", "identificado");
    if (filter === "compartido" || filter === "personal") q = q.eq("scope", filter);
    if (filter === "otros") q = q.in("kind", ["transferencia_interna", "pago_tarjeta", "liquidacion"]);
  }
  const [{ data }, { data: pocketData }] = await Promise.all([
    q.returns<TransactionRow[]>(),
    supabase
      .from("pockets")
      .select("id, name, owner_member_id, is_active")
      .eq("household_id", me.household_id)
      .returns<{ id: string; name: string; owner_member_id: string | null; is_active: boolean }[]>(),
  ]);
  const txs = data ?? [];
  const allPockets = pocketData ?? [];
  const pocketName = new Map(allPockets.map((p) => [p.id, p.name]));
  const activePockets = allPockets.filter((p) => p.is_active);
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const acctName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader title="Movimientos" month={month} basePath="/movimientos" backHref="/inicio" />
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
        <ul className="card mx-4 overflow-hidden">
          {txs.map((t) => {
            const hasCategory = t.kind === "gasto" || (t.kind === "ingreso" && !!t.category_id);
            // Título: la categoría (o el tipo); el comercio queda como detalle
            const title = hasCategory ? (t.category_id ? catById.get(t.category_id)?.name ?? "Sin categoría" : "Sin categoría") : KIND_LABEL[t.kind];
            const group = t.category_id ? catById.get(catById.get(t.category_id)?.parent_id ?? "")?.name : undefined;
            const label = [group, t.scope === "compartido" ? "🏠 compartido" : t.scope === "personal" ? "👤 personal" : null, t.merchant]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={t.id} className="list-row">
                <CatIcon
                  visual={
                    hasCategory
                      ? visualFor(t.category_id, allCategories)
                      : { color: "var(--g-neutral)", icon: t.kind === "liquidacion" ? "⚖️" : t.kind === "pago_tarjeta" ? "💳" : "↔️" }
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="muted truncate text-xs">
                    {shortDate(t.occurred_on)} · {label} · {memberName(ctx, t.paid_by_member_id)}
                    {t.kind === "liquidacion" && ` → ${memberName(ctx, t.counterparty_member_id)}`}
                    {t.account_id && ` · ${acctName.get(t.account_id)}`}
                  </p>
                  {t.pocket_id && <p className="text-xs text-[var(--color-brand)]">🐷 Pagado desde {pocketName.get(t.pocket_id) ?? "bolsillo"}</p>}
                  {t.budget_month && <p className="text-xs text-amber-700">📅 Fecha real {shortDate(t.occurred_on)} · cuenta en {monthLabel(t.budget_month)}</p>}
                </div>
                <p className={`tabular text-sm font-semibold ${t.kind === "ingreso" ? "text-emerald-600" : ""}`}>
                  {t.kind === "ingreso" ? "+" : ""}
                  {formatCOP(t.amount)}
                </p>
                <TxActions
                  id={t.id}
                  canReopen={t.kind !== "liquidacion"}
                  canDelete={t.source === "manual" || t.source === "recurrente"}
                  currentPocketId={t.pocket_id}
                  dateMonth={t.kind === "liquidacion" ? undefined : t.occurred_on.slice(0, 7)}
                  budgetMonth={t.budget_month}
                  pockets={
                    t.status === "identificado" && (t.kind === "gasto" || t.kind === "ingreso")
                      ? activePockets.filter((p) => pocketFitsTx(p.owner_member_id, t))
                      : []
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
