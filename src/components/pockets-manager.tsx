"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addPocketMovement,
  deletePocketMovement,
  savePocket,
  setPocketActive,
  type ActionResult,
} from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";
import { shiftMonth, shortDate } from "@/domain/dates";
import { formatCOP, formatPct } from "@/domain/money";
import type { PocketSummary } from "@/domain/pockets";
import type { PocketRow } from "@/lib/db-types";

export interface PocketView extends PocketRow {
  summary: PocketSummary;
  history: { id: string; date: string; label: string; amount: number; movementId: string | null }[];
}

export interface LeftoverInfo {
  ownerMemberId: string | null;
  label: string;
  leftover: number;
  alreadyMoved: number;
  hasBudget: boolean;
}

interface Props {
  pockets: PocketView[];
  leftovers: LeftoverInfo[];
  leftoverMonth: string;
  leftoverMonthLabel: string;
  today: string;
  meId: string;
  members: { id: string; name: string }[];
}

function useAction() {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error, error: true });
      if (r.ok) onOk?.();
      if (r.ok) setTimeout(() => setMsg(null), 2500);
    });
  const feedback = msg && <p className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>;
  return { busy, run, feedback };
}

export function PocketsManager({ pockets, leftovers, leftoverMonth, leftoverMonthLabel, today, meId, members }: Props) {
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const active = pockets.filter((p) => p.is_active);
  const archived = pockets.filter((p) => !p.is_active);
  const ownerName = (id: string | null) =>
    id === null ? "Compartido" : id === meId ? "Mío" : `De ${members.find((m) => m.id === id)?.name ?? "—"}`;
  const total = active.reduce((a, p) => a + p.summary.balance, 0);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <p className="muted text-xs">
        Plata apartada para algo (viaje, imprevistos…). Se llenan pasando el sobrante del mes o con aportes, y se gastan
        marcando un gasto como “pagado desde el bolsillo”: así no se come el presupuesto del mes. En “quién le debe a quién”
        ese gasto sigue contando normal.
      </p>

      {active.length > 0 && (
        <section className="card flex items-center justify-between p-4">
          <span className="muted text-sm">Total en bolsillos</span>
          <span className="tabular text-xl font-bold text-[var(--color-brand)]">{formatCOP(total)}</span>
        </section>
      )}

      {leftovers.length > 0 && active.length > 0 && (
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Sobrante de <span className="capitalize">{leftoverMonthLabel}</span>
            </h2>
            <span className="flex gap-3 text-sm">
              <Link href={`/bolsillos?mes=${shiftMonth(leftoverMonth, -1)}`} aria-label="Mes anterior">‹</Link>
              <Link href={`/bolsillos?mes=${shiftMonth(leftoverMonth, 1)}`} aria-label="Mes siguiente">›</Link>
            </span>
          </div>
          {leftovers.map((l) => (
            <LeftoverRow
              key={`${l.ownerMemberId ?? "compartido"}-${leftoverMonth}`}
              info={l}
              month={leftoverMonth}
              today={today}
              pockets={active.filter((p) => p.owner_member_id === l.ownerMemberId)}
            />
          ))}
        </section>
      )}

      {active.map((p) => (
        <article key={p.id} className="card overflow-hidden">
          <button className="flex w-full flex-col gap-2 p-4 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">🐷 {p.name}</span>
                <span className="muted text-xs">{ownerName(p.owner_member_id)}</span>
              </span>
              <span className={`tabular shrink-0 text-lg font-bold ${p.summary.balance < 0 ? "text-red-600" : ""}`}>
                {formatCOP(p.summary.balance)}
              </span>
            </div>
            {p.target_amount && (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                  <div
                    className="h-full bg-[var(--color-brand)]"
                    style={{ width: `${Math.max(0, Math.min(100, (p.summary.progress ?? 0) * 100))}%` }}
                  />
                </div>
                <span className="muted text-xs">
                  {formatPct(Math.max(0, p.summary.progress ?? 0), 0)} de la meta de {formatCOP(p.target_amount)}
                  {p.summary.balance < p.target_amount && ` · faltan ${formatCOP(p.target_amount - p.summary.balance)}`}
                </span>
              </>
            )}
          </button>
          {open === p.id && <PocketDetail pocket={p} today={today} members={members} onClose={() => setOpen(null)} />}
        </article>
      ))}

      {active.length === 0 && !creating && (
        <p className="muted py-6 text-center text-sm">Aún no hay bolsillos. Creen uno para el viaje y otro para imprevistos.</p>
      )}

      {creating ? (
        <PocketForm pocket={null} members={members} onDone={() => setCreating(false)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Nuevo bolsillo
        </button>
      )}

      {archived.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Archivados ({archived.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {archived.map((p) => (
              <ArchivedRow key={p.id} pocket={p} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LeftoverRow({ info, month, today, pockets }: { info: LeftoverInfo; month: string; today: string; pockets: PocketView[] }) {
  const remaining = Math.max(0, info.leftover - info.alreadyMoved);
  const [amount, setAmount] = useState<number | null>(remaining || null);
  const [pocketId, setPocketId] = useState(pockets[0]?.id ?? "");
  const { busy, run, feedback } = useAction();

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--bg)] p-3 text-sm">
      <div className="flex justify-between">
        <span>{info.label}</span>
        <span className="tabular font-semibold">{formatCOP(info.leftover)}</span>
      </div>
      {info.alreadyMoved > 0 && <p className="muted text-xs">Ya pasaron {formatCOP(info.alreadyMoved)} a bolsillos.</p>}
      {info.leftover === 0 ? (
        <p className="muted text-xs">No sobró presupuesto ese mes.</p>
      ) : pockets.length === 0 ? (
        <p className="muted text-xs">Creen un bolsillo {info.ownerMemberId ? "personal" : "compartido"} para guardar este sobrante.</p>
      ) : remaining > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <MoneyInput value={amount} onValueChange={setAmount} />
            <select className="input" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              {pockets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !amount || !pocketId}
            onClick={() => run(() => addPocketMovement({ pocketId, kind: "sobrante", amount: amount!, date: today, month, note: null }))}
          >
            Pasar al bolsillo
          </button>
        </div>
      ) : (
        <p className="text-xs text-emerald-700">✓ Ya pasaron todo el sobrante.</p>
      )}
      {feedback}
    </div>
  );
}

function PocketDetail({
  pocket,
  today,
  members,
  onClose,
}: {
  pocket: PocketView;
  today: string;
  members: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"aporte" | "retiro">("aporte");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const { busy, run, feedback } = useAction();

  if (editing) return <PocketForm pocket={pocket} members={members} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--bg)] p-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <button className="chip" data-active={kind === "aporte"} onClick={() => setKind("aporte")}>
          + Aporte
        </button>
        <button className="chip" data-active={kind === "retiro"} onClick={() => setKind("retiro")}>
          − Retiro
        </button>
      </div>
      <MoneyInput value={amount} onValueChange={setAmount} placeholder="Valor" />
      <input className="input" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn btn-primary"
        disabled={busy || !amount}
        onClick={() =>
          run(
            () => addPocketMovement({ pocketId: pocket.id, kind, amount: amount!, date: today, month: null, note: note || null }),
            () => {
              setAmount(null);
              setNote("");
            },
          )
        }
      >
        {kind === "aporte" ? "Registrar aporte" : "Registrar retiro"}
      </button>
      <p className="muted text-xs">
        Para gastar del bolsillo, marca el gasto como “pagado desde {pocket.name}” al clasificarlo en Pendientes o desde
        Movimientos.
      </p>

      {pocket.history.length > 0 && (
        <ul className="divide-y divide-[var(--line)] rounded-xl bg-[var(--card)]">
          {pocket.history.slice(0, 30).map((h) => (
            <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="muted w-14 shrink-0">{shortDate(h.date)}</span>
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              <span className={`tabular shrink-0 font-semibold ${h.amount < 0 ? "" : "text-emerald-600"}`}>
                {h.amount > 0 ? "+" : ""}
                {formatCOP(h.amount)}
              </span>
              {h.movementId && (
                <button
                  className="muted px-1"
                  aria-label="Eliminar"
                  disabled={busy}
                  onClick={() => run(() => deletePocketMovement(h.movementId!))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => setEditing(true)}>
          Editar
        </button>
        <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => run(() => setPocketActive(pocket.id, false), onClose)}>
          Archivar
        </button>
      </div>
      {feedback}
    </div>
  );
}

function PocketForm({
  pocket,
  members,
  onDone,
}: {
  pocket: PocketRow | null;
  members: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [name, setName] = useState(pocket?.name ?? "");
  const [owner, setOwner] = useState<string>(pocket?.owner_member_id ?? "");
  const [target, setTarget] = useState<number | null>(pocket?.target_amount ?? null);
  const [opening, setOpening] = useState<number | null>(pocket?.opening_balance ?? null);
  const { busy, run, feedback } = useAction();

  return (
    <div className={`flex flex-col gap-2 p-4 text-sm ${pocket ? "border-t border-[var(--line)] bg-[var(--bg)]" : "card"}`}>
      <input
        className="input"
        placeholder="Nombre (ej. Viaje, Imprevistos)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!pocket}
      />
      <label className="flex flex-col gap-1 text-xs">
        De quién
        <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">🏠 Compartido (los dos)</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              👤 {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Meta (opcional)
        <MoneyInput value={target} onValueChange={setTarget} placeholder="Ej. 5.000.000" />
      </label>
      <label className="text-xs">
        Saldo con el que arranca (si ya tienen algo ahorrado)
        <MoneyInput value={opening} onValueChange={setOpening} placeholder="0" />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onDone}>
          Cancelar
        </button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !name.trim()}
          onClick={() =>
            run(
              () =>
                savePocket({
                  id: pocket?.id ?? null,
                  name,
                  ownerMemberId: owner || null,
                  targetAmount: target,
                  openingBalance: opening ?? 0,
                }),
              onDone,
            )
          }
        >
          {pocket ? "Guardar" : "Crear bolsillo"}
        </button>
      </div>
      {feedback}
    </div>
  );
}

function ArchivedRow({ pocket }: { pocket: PocketView }) {
  const { busy, run, feedback } = useAction();
  return (
    <li className="flex items-center gap-2">
      <span className="muted min-w-0 flex-1 truncate">
        {pocket.name} · {formatCOP(pocket.summary.balance)}
      </span>
      <button className="text-xs underline" disabled={busy} onClick={() => run(() => setPocketActive(pocket.id, true))}>
        Activar
      </button>
      {feedback}
    </li>
  );
}
