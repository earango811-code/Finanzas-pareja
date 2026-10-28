import Link from "next/link";
import { CloseAction } from "@/components/close-actions";
import { PageHeader } from "@/components/page-header";
import { ReconcileAccount } from "@/components/reconcile-account";
import { currentMonth, isValidMonth, monthLabel, shiftMonth, shortDate } from "@/domain/dates";
import { formatCOP, formatPct } from "@/domain/money";
import { getHousehold, memberName } from "@/lib/household";
import { loadCloseData } from "@/lib/month-close-data";

export const metadata = { title: "Cierre de mes" };

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${done ? "bg-emerald-600 text-white" : "bg-[var(--line)]"}`}
          aria-hidden
        >
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const ctx = await getHousehold();
  const { members, household } = ctx;
  // Por defecto, el mes anterior (el que toca cerrar); nunca antes del mes en que empezaron
  const fallback = shiftMonth(currentMonth(), -1);
  const month = isValidMonth(sp.mes)
    ? sp.mes
    : household.start_month && fallback < household.start_month
      ? household.start_month
      : fallback;
  const data = await loadCloseData(ctx, month);
  const closed = !!data.close?.closed_at;
  const recon = data.close?.reconciliations ?? {};
  const reconciledCount = data.accounts.filter((a) => recon[a.id]).length;
  const pocketsDone = data.groupCloses.every((g) => g.remaining === 0);
  const name = (id: string) => memberName(ctx, id);
  const s = data.summary;

  return (
    <>
      <PageHeader title="Cierre de mes" month={month} basePath="/cierre" backHref="/mas" />
      <div className="flex flex-col gap-6 px-4 pb-10">
        {closed ? (
          <div className="card flex flex-col gap-2 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p>
              ✓ <span className="capitalize">{monthLabel(month)}</span> está cerrado desde el {shortDate(data.close!.closed_at!.slice(0, 10))}.
            </p>
            <CloseAction kind="reopen" month={month} />
          </div>
        ) : (
          <p className="muted text-xs">
            Cuatro pasos para cuadrar el mes con el banco, guardar los ahorros en sus bolsillos y saber con cuánto queda cada uno.
          </p>
        )}

        <Step n={1} title="Conciliación con el extracto del banco" done={data.accounts.length > 0 && reconciledCount === data.accounts.length}>
          <p className="muted -mt-1 text-xs">
            Cruza el extracto de cada cuenta con lo registrado en la app: lo que falte en la app se agrega a Pendientes y lo que no
            aparezca en el banco se puede quitar. {reconciledCount} de {data.accounts.length} cuentas conciliadas.
          </p>
          <ul className="flex flex-col gap-3">
            {data.accounts.map((a) => (
              <ReconcileAccount
                key={a.id}
                month={month}
                closed={closed}
                info={recon[a.id] ?? null}
                account={{ id: a.id, name: a.name, owner: name(a.owner_member_id), last4: a.card_last4 ?? a.last4, txs: a.txs }}
              />
            ))}
          </ul>
          {data.accounts.length === 0 && (
            <Link href="/ajustes/cuentas" className="card block p-4 text-sm">
              Registren primero sus cuentas y tarjetas →
            </Link>
          )}
        </Step>

        <Step n={2} title="Clasificar lo agregado y lo pendiente" done={data.pendingCount === 0}>
          {data.pendingCount > 0 ? (
            <Link href="/pendientes" className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <span className="flex-1">
                Quedan <b>{data.pendingCount}</b> movimientos de este mes por clasificar (grupo y compartido/personal). Sin eso no
                cuentan en el presupuesto ni en el cierre.
              </span>
              <span>›</span>
            </Link>
          ) : (
            <p className="muted text-sm">✓ No quedan pendientes de este mes.</p>
          )}
        </Step>

        <Step n={3} title="Pasar los saldos a los bolsillos" done={data.groupCloses.length > 0 && pocketsDone}>
          <ul className="card overflow-hidden">
            {data.groupCloses.map((g) => (
              <li key={g.categoryId} className="list-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {g.groupName} → 🐷 {g.pocketName}
                  </span>
                  <span className="muted block text-xs">
                    Presupuesto {formatCOP(g.budgeted)}
                    {g.spent > 0 && ` · usado ${formatCOP(g.spent)}`}
                    {g.alreadyMoved > 0 && ` · ya pasado ${formatCOP(g.alreadyMoved)}`}
                  </span>
                </span>
                <span className={`tabular font-semibold ${g.remaining === 0 ? "text-emerald-700" : ""}`}>
                  {g.remaining === 0 ? "✓" : formatCOP(g.remaining)}
                </span>
              </li>
            ))}
            {data.groupCloses.length === 0 && (
              <li className="muted list-row text-sm">Ningún grupo tiene bolsillo. Se asigna en Grupos y categorías.</li>
            )}
          </ul>
          {!closed && !pocketsDone && <CloseAction kind="transfer" month={month} />}
        </Step>

        <Step n={4} title="Ingreso final de cada uno" done={closed}>
          <p className="muted -mt-1 text-xs">
            Lo que le queda a cada uno después de su parte del gasto compartido y de lo que se pasó a los bolsillos. Todo se reparte
            con el % del ingreso disponible, así que el ahorro también queda en esa proporción.
          </p>
          <div className="card overflow-x-auto p-4">
            <table className="tabular w-full text-sm">
              <thead className="muted text-left text-xs">
                <tr>
                  <th className="pb-2 font-normal" />
                  {s.members.map((m) => (
                    <th key={m.memberId} className="pb-2 text-right font-normal">
                      {name(m.memberId)} <span className="block">{formatPct(m.ratio)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--line)]">
                  <td className="py-2">Ingreso disponible</td>
                  {s.members.map((m) => <td key={m.memberId} className="text-right">{formatCOP(m.available)}</td>)}
                </tr>
                <tr>
                  <td className="py-2">− Gasto compartido</td>
                  {s.members.map((m) => <td key={m.memberId} className="text-right">{formatCOP(m.sharedSpent)}</td>)}
                </tr>
                <tr>
                  <td className="py-2">− A los bolsillos</td>
                  {s.members.map((m) => <td key={m.memberId} className="text-right">{formatCOP(m.toPockets)}</td>)}
                </tr>
                <tr className="border-t border-[var(--line)] font-bold">
                  <td className="py-2">= Ingreso final</td>
                  {s.members.map((m) => (
                    <td key={m.memberId} className={`text-right ${m.finalIncome < 0 ? "text-red-600" : "text-[var(--color-brand)]"}`}>
                      {formatCOP(m.finalIncome)}
                    </td>
                  ))}
                </tr>
                <tr className="muted">
                  <td className="py-2 text-xs">Gastos personales</td>
                  {s.members.map((m) => <td key={m.memberId} className="text-right text-xs">{formatCOP(m.personalSpent)}</td>)}
                </tr>
                <tr className="muted">
                  <td className="py-2 text-xs">Libre después de lo personal</td>
                  {s.members.map((m) => <td key={m.memberId} className="text-right text-xs">{formatCOP(m.free)}</td>)}
                </tr>
              </tbody>
            </table>
            <p className="muted mt-3 text-xs">
              Entre los dos: ingreso {formatCOP(s.income)} − gasto compartido {formatCOP(s.sharedSpent)} − bolsillos{" "}
              {formatCOP(s.toPockets)} = <b>{formatCOP(s.savedTotal)}</b>
            </p>
          </div>

          {data.settlement.transfer && (
            <Link href={`/balance?mes=${month}`} className="card flex items-center gap-3 p-4 text-sm">
              <span className="text-xl" aria-hidden>⚖️</span>
              <span className="flex-1">
                Para quedar a paz y salvo, <b>{name(data.settlement.transfer.from)}</b> le pasa{" "}
                <b>{formatCOP(data.settlement.transfer.amount)}</b> a <b>{name(data.settlement.transfer.to)}</b>.
              </span>
              <span className="muted">›</span>
            </Link>
          )}

          {!closed && (
            <>
              <CloseAction kind="close" month={month} disabled={data.pendingCount > 0} />
              {data.pendingCount > 0 && <p className="muted text-center text-xs">Para cerrar, primero clasifiquen los pendientes (paso 2).</p>}
            </>
          )}
          {members.length < 2 && <p className="muted text-xs">Falta que la pareja se una al hogar para repartir.</p>}
        </Step>
      </div>
    </>
  );
}
