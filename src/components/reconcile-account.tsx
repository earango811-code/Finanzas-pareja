"use client";

import { useMemo, useState, useTransition } from "react";
import { ignoreTransactions } from "@/app/(app)/actions";
import { addStatementTransactions, saveReconciliation } from "@/app/(app)/cierre/actions";
import { monthRange, shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { reconcile, type AppTx } from "@/domain/reconcile";
import { parseStatement, type StatementLine } from "@/domain/statement";
import type { ReconciliationInfo } from "@/lib/month-close-data";

interface Props {
  month: string;
  account: { id: string; name: string; owner: string; last4: string | null; txs: AppTx[] };
  info: ReconciliationInfo | null;
  closed: boolean;
}

const lineKey = (l: StatementLine, i: number) => `${l.date}-${l.amount}-${l.direction}-${i}`;

export function ReconcileAccount({ month, account, info, closed }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [invert, setInvert] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(0);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();

  const { start: from, end: to } = monthRange(month);
  const parsed = useMemo(() => parseStatement(text, { invertSigns: invert }), [text, invert]);
  const inMonth = parsed.lines.filter((l) => l.date >= from && l.date < to);
  const outside = parsed.lines.length - inMonth.length;
  const result = useMemo(() => reconcile(inMonth, account.txs.filter((t) => !removed.has(t.id))), [inMonth, account.txs, removed]);
  const missing = result.onlyInBank.map((l, i) => ({ l, key: lineKey(l, i) }));
  const selected = picked ?? new Set(missing.map((m) => m.key));

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error ?? "No se pudo", error: true });
      if (r.ok) after?.();
    });

  async function readFile(f: File) {
    const buf = await f.arrayBuffer();
    // Los CSV del banco a veces vienen en Latin-1: si UTF-8 trae caracteres inválidos, se reintenta
    let t = new TextDecoder("utf-8").decode(buf);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
    setText(t);
    setPicked(null);
  }

  return (
    <li className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-base" aria-hidden>
          {info ? "✅" : "🏦"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {account.name}
            {account.last4 && <span className="muted"> *{account.last4}</span>}
          </span>
          <span className="muted block truncate text-xs">
            {account.owner} ·{" "}
            {info
              ? `Conciliada ${shortDate(info.at.slice(0, 10))}: ${info.matched} cuadran, ${info.added} agregados, ${info.removed} quitados`
              : `${account.txs.length} movimientos en la app · sin conciliar`}
          </span>
        </span>
        <span className="muted">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--bg)] p-4 text-sm">
          {closed ? (
            <p className="muted text-xs">El mes está cerrado. Reábrelo para conciliar de nuevo.</p>
          ) : (
            <>
              <p className="muted text-xs">
                Descarga los movimientos de esta cuenta en la Sucursal Virtual de Bancolombia (CSV) y súbelos aquí, o copia y pega
                las filas del extracto (fecha, descripción y valor).
              </p>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="text-xs"
                onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
              />
              <textarea
                className="input min-h-24 font-mono text-xs"
                placeholder={"Fecha;Descripción;Valor\n01/11/2026;COMPRA EN D1;-45.300"}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPicked(null);
                }}
              />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                Las compras vienen en positivo (extracto de tarjeta de crédito)
              </label>
            </>
          )}

          {!closed && text && (
            <>
              <p className="text-xs">
                <b>{inMonth.length}</b> movimientos del extracto en el mes
                {outside > 0 && ` · ${outside} de otros meses (no se tienen en cuenta)`}
                {parsed.skipped > 0 && ` · ${parsed.skipped} filas sin leer`}
                {" · "}
                <span className="text-emerald-700">✓ {result.matched.length} cuadran</span>
              </p>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold">En el banco y no en la app ({missing.length})</h3>
                {missing.length === 0 ? (
                  <p className="muted text-xs">Nada que agregar.</p>
                ) : (
                  <>
                    <ul className="card divide-y divide-[var(--line)]">
                      {missing.map(({ l, key }) => (
                        <li key={key}>
                          <label className="flex items-center gap-2 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={(e) => {
                                const s = new Set(selected);
                                if (e.target.checked) s.add(key);
                                else s.delete(key);
                                setPicked(s);
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{l.description}</span>
                              <span className="muted text-xs">{shortDate(l.date)}</span>
                            </span>
                            <span className={`tabular font-semibold ${l.direction === "credito" ? "text-emerald-600" : ""}`}>
                              {l.direction === "credito" ? "+" : "−"}
                              {formatCOP(l.amount)}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="btn btn-primary"
                      disabled={busy || selected.size === 0}
                      onClick={() => {
                        const lines = missing.filter((m) => selected.has(m.key)).map((m) => m.l);
                        run(() => addStatementTransactions({ accountId: account.id, month, lines }), () => setAdded((a) => a + lines.length));
                      }}
                    >
                      Agregar {selected.size} a Pendientes
                    </button>
                  </>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold">En la app y no en el banco ({result.onlyInApp.length})</h3>
                {result.onlyInApp.length === 0 ? (
                  <p className="muted text-xs">Todo lo de la app aparece en el extracto.</p>
                ) : (
                  <ul className="card divide-y divide-[var(--line)]">
                    {result.onlyInApp.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{t.description}</span>
                          <span className="muted text-xs">{shortDate(t.date)}</span>
                        </span>
                        <span className="tabular font-semibold">{formatCOP(t.amount)}</span>
                        <button
                          className="chip !py-1 text-xs text-red-600"
                          disabled={busy}
                          onClick={() => run(() => ignoreTransactions([t.id]), () => setRemoved((s) => new Set(s).add(t.id)))}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {result.onlyInApp.length > 0 && (
                  <p className="muted text-xs">“Quitar” lo marca como ignorado (no cuenta en nada). Déjalo si de verdad fue con esta cuenta.</p>
                )}
              </section>

              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    saveReconciliation({
                      month,
                      accountId: account.id,
                      lines: inMonth.length,
                      matched: result.matched.length,
                      added,
                      removed: removed.size,
                    }),
                  )
                }
              >
                ✓ Marcar la cuenta como conciliada
              </button>
            </>
          )}
          {msg && <p className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
        </div>
      )}
    </li>
  );
}
