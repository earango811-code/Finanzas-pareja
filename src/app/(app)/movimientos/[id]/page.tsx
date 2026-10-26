import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TxEditor } from "@/components/tx-editor";
import { shortDate } from "@/domain/dates";
import { toOptions } from "@/lib/categories";
import { TX_COLUMNS, type TransactionRow } from "@/lib/db-types";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Movimiento" };

const SOURCE_LABEL: Record<TransactionRow["source"], string> = {
  email: "Alerta de Bancolombia (correo)",
  notificacion: "Notificación",
  csv: "Extracto (CSV)",
  manual: "Registrado a mano",
  recurrente: "Recurrente",
};

export default async function MovimientoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Solo rutas internas para el botón de volver
  const backHref = sp.volver?.startsWith("/") && !sp.volver.startsWith("//") ? sp.volver : "/movimientos";

  const { supabase, me, members, accounts, categories, allCategories } = await getHousehold();
  const [{ data: tx }, { data: pockets }] = await Promise.all([
    supabase.from("transactions").select(TX_COLUMNS).eq("id", id).eq("household_id", me.household_id).maybeSingle<TransactionRow>(),
    supabase
      .from("pockets")
      .select("id, name, owner_member_id")
      .eq("household_id", me.household_id)
      .eq("is_active", true)
      .order("sort_order")
      .returns<{ id: string; name: string; owner_member_id: string | null }[]>(),
  ]);
  if (!tx) notFound();

  // Si el movimiento está en una categoría desactivada, que siga apareciendo para no perderla
  const current = tx.category_id ? allCategories.find((c) => c.id === tx.category_id) : undefined;
  const cats = current && !current.is_active ? [...categories, current] : categories;

  return (
    <>
      <PageHeader title={tx.merchant || "Movimiento"} backHref={backHref} />
      <p className="muted -mt-2 px-4 pb-3 text-xs">
        {SOURCE_LABEL[tx.source]} · {shortDate(tx.occurred_on)}
        {tx.account_last4 && ` · *${tx.account_last4}`}
      </p>
      <TxEditor
        key={`${tx.id}-${tx.status}`}
        backHref={backHref}
        tx={{
          id: tx.id,
          kind: tx.kind,
          amount: tx.amount,
          date: tx.occurred_on,
          budgetMonth: tx.budget_month,
          scope: tx.scope,
          categoryId: tx.category_id,
          paidBy: tx.paid_by_member_id,
          counterpartyId: tx.counterparty_member_id,
          accountId: tx.account_id,
          pocketId: tx.pocket_id,
          merchant: tx.merchant ?? "",
          notes: tx.notes ?? "",
          status: tx.status,
          canDelete: tx.source === "manual" || tx.source === "recurrente",
        }}
        members={members.map((m) => ({ id: m.id, name: m.id === me.id ? "Yo" : m.display_name }))}
        accounts={accounts.filter((a) => a.is_active || a.id === tx.account_id).map((a) => ({ id: a.id, name: a.name, ownerId: a.owner_member_id }))}
        categories={toOptions(cats)}
        pockets={pockets ?? []}
      />
      {tx.raw_description && (
        <details className="mx-4 mb-8 text-xs">
          <summary className="muted cursor-pointer">Texto original</summary>
          <p className="muted mt-1 whitespace-pre-wrap break-words">{tx.raw_description}</p>
        </details>
      )}
    </>
  );
}
