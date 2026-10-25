import { PageHeader } from "@/components/page-header";
import { SettleButton } from "@/components/settle-button";
import { currentMonth, defaultMonth, isValidMonth, monthRange, todayBogota } from "@/domain/dates";
import { formatCOP, formatPct } from "@/domain/money";
import { computeSettlement, splitShares } from "@/domain/split";
import { getHousehold, memberName } from "@/lib/household";
import { loadMonth } from "@/lib/month-data";

export const metadata = { title: "Balance" };

export default async function BalancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonth(sp.mes) ? sp.mes : defaultMonth((await getHousehold()).household.start_month);
  const ctx = await getHousehold();
  const { members } = ctx;
  const { txs, pendingCount } = await loadMonth(ctx, month);

  const result = computeSettlement(members, txs);
  const shares = new Map(splitShares(members).map((s) => [s.memberId, s.ratio]));
  const name = (id: string) => memberName(ctx, id);

  // La liquidación se registra con fecha dentro del mes que se está cuadrando.
  const today = todayBogota();
  const { start, end } = monthRange(month);
  const settleDate = today >= start && today < end ? today : new Date(new Date(`${end}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="¿Quién le debe a quién?" month={month} basePath="/balance" />
      <div className="flex flex-col gap-4 px-4">
        {pendingCount > 0 && (
          <a href="/pendientes" className="card block border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            ⚠️ Hay {pendingCount} pendientes de este mes. Clasifícalos antes de liquidar →
          </a>
        )}

        <section className="card p-5 text-center">
          {result.transfer ? (
            <>
              <p className="muted text-sm">Este mes</p>
              <p className="mt-1 text-lg">
                <b>{name(result.transfer.from)}</b> le debe a <b>{name(result.transfer.to)}</b>
              </p>
              <p className="tabular mt-2 text-3xl font-bold text-[var(--color-brand)]">{formatCOP(result.transfer.amount)}</p>
              <div className="mt-4">
                <SettleButton from={result.transfer.from} to={result.transfer.to} amount={result.transfer.amount} date={settleDate} />
              </div>
            </>
          ) : (
            <>
              <p className="text-4xl">🤝</p>
              <p className="mt-2 text-lg font-semibold">Están a paz y salvo</p>
            </>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Detalle</h2>
          <p className="muted mb-3 text-xs">Total compartido del mes: {formatCOP(result.sharedTotal)}</p>
          <table className="tabular w-full text-sm">
            <thead className="muted text-left text-xs">
              <tr>
                <th className="pb-1 font-normal" />
                {result.balances.map((b) => (
                  <th key={b.memberId} className="pb-1 text-right font-normal">{name(b.memberId)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="% de reparto" values={result.balances.map((b) => formatPct(shares.get(b.memberId) ?? 0))} />
              <Row label="Le toca pagar" values={result.balances.map((b) => formatCOP(b.owes))} />
              <Row label="Pagó" values={result.balances.map((b) => formatCOP(b.paid))} />
              <Row label="Liquidaciones" values={result.balances.map((b) => formatCOP(b.settled))} />
              <Row
                label="Saldo"
                bold
                values={result.balances.map((b) => (b.balance >= 0 ? `+${formatCOP(b.balance)}` : formatCOP(b.balance)))}
              />
            </tbody>
          </table>
          <p className="muted mt-3 text-xs">
            Saldo positivo = le deben. Solo cuentan gastos compartidos identificados; los reembolsos compartidos restan.
          </p>
        </section>
      </div>
    </>
  );
}

function Row({ label, values, bold }: { label: string; values: string[]; bold?: boolean }) {
  return (
    <tr className={`border-t border-[var(--line)] ${bold ? "font-bold" : ""}`}>
      <td className="py-1.5">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="text-right">{v}</td>
      ))}
    </tr>
  );
}
