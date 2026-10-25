"use client";

import { useState, useTransition } from "react";
import {
  deleteRecurring,
  saveRecurring,
  setRecurringActive,
  type ActionResult,
} from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";
import { shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { FREQUENCY_LABEL, monthlyEquivalent, upcoming, type Frequency } from "@/domain/recurring";
import type { TxScope } from "@/domain/types";
import type { CategoryOption } from "@/lib/categories";
import type { RecurringRow } from "@/lib/recurring-runner";

interface Props {
  items: RecurringRow[];
  today: string;
  meId: string;
  members: { id: string; name: string }[];
  accounts: { id: string; name: string; ownerId: string }[];
  categories: CategoryOption[];
  categoryLabels: Record<string, string>;
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

export function RecurringManager(props: Props) {
  const { items, members, categoryLabels } = props;
  const [editing, setEditing] = useState<string | null>(null); // id, "new" o null
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "—";

  const activeGastos = items.filter((r) => r.is_active && r.kind === "gasto");
  const sharedMonthly = activeGastos.filter((r) => r.scope === "compartido").reduce((a, r) => a + monthlyEquivalent(r.amount, r.frequency), 0);
  const personalMonthly = activeGastos.filter((r) => r.scope !== "compartido").reduce((a, r) => a + monthlyEquivalent(r.amount, r.frequency), 0);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <p className="muted text-xs">
        Gastos o ingresos que se repiten: arriendo, empleada, suscripciones, salario… La app los crea sola en su fecha.
        Si se pagan con una cuenta que manda alertas del banco, marca “Entra a Pendientes” para no contarlos dos veces.
      </p>

      {items.some((r) => r.is_active) && (
        <section className="card grid grid-cols-2 gap-2 p-4 text-center">
          <div>
            <p className="muted text-xs">Compartido al mes</p>
            <p className="tabular font-bold">{formatCOP(sharedMonthly)}</p>
          </div>
          <div>
            <p className="muted text-xs">Personal al mes</p>
            <p className="tabular font-bold">{formatCOP(personalMonthly)}</p>
          </div>
        </section>
      )}

      {editing === "new" ? (
        <RecurringForm {...props} item={null} onDone={() => setEditing(null)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setEditing("new")}>+ Programar recurrente</button>
      )}

      {items.length === 0 && editing !== "new" && (
        <p className="muted py-10 text-center text-sm">Aún no hay transacciones recurrentes.</p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((r) => (
          <li key={r.id} className={`card overflow-hidden ${r.is_active ? "" : "opacity-60"}`}>
            <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setEditing(editing === r.id ? null : r.id)}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="muted truncate text-xs">
                  {FREQUENCY_LABEL[r.frequency]} · {r.category_id ? categoryLabels[r.category_id] : "Sin categoría"}
                  {r.scope && ` · ${r.scope}`} · {name(r.paid_by_member_id)}
                </p>
                <p className="mt-1 text-xs">
                  {r.is_active ? (
                    <>Próximas: {upcoming(r, 3).map(shortDate).join(", ") || "—"}</>
                  ) : (
                    <span className="muted">En pausa o terminada</span>
                  )}
                  {!r.auto_identify && <span className="muted"> · entra a Pendientes</span>}
                </p>
              </div>
              <p className={`tabular shrink-0 font-bold ${r.kind === "ingreso" ? "text-emerald-600" : ""}`}>
                {r.kind === "ingreso" ? "+" : ""}
                {formatCOP(r.amount)}
              </p>
            </button>
            {editing === r.id && <RecurringForm {...props} item={r} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecurringForm({
  item,
  today,
  meId,
  members,
  accounts,
  categories,
  onDone,
}: Props & { item: RecurringRow | null; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState<number | null>(item?.amount ?? null);
  const [kind, setKind] = useState<"gasto" | "ingreso">(item?.kind ?? "gasto");
  const [scope, setScope] = useState<TxScope | null>(item?.scope ?? "compartido");
  const [categoryId, setCategoryId] = useState<string>(item?.category_id ?? "");
  const [paidBy, setPaidBy] = useState(item?.paid_by_member_id ?? meId);
  const [accountId, setAccountId] = useState<string>(item?.account_id ?? "");
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? "mensual");
  const [startDate, setStartDate] = useState(item?.start_date ?? today);
  const [endDate, setEndDate] = useState(item?.end_date ?? "");
  const [autoIdentify, setAutoIdentify] = useState(item?.auto_identify ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run, feedback } = useAction();

  const allowed = scope === "personal" ? ["personal", "ambas"] : ["compartida", "ambas"];
  const catOptions = categories.filter((c) => allowed.includes(c.scope) && (kind === "ingreso" || !c.isIncome));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const label = (c: CategoryOption) => (c.parentId ? `${byId.get(c.parentId)?.name} › ${c.name}` : c.name);
  const isBackfill = !item && startDate < today;

  return (
    <div className={`flex flex-col gap-2 p-4 text-sm ${item ? "border-t border-[var(--line)] bg-[var(--bg)]" : "card"}`}>
      <div className="grid grid-cols-2 gap-2">
        {(["gasto", "ingreso"] as const).map((k) => (
          <button key={k} className="chip" data-active={kind === k} onClick={() => setKind(k)}>
            {k === "gasto" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>
      <input className="input" placeholder="Nombre (ej. Arriendo, Empleada, Netflix)" value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput value={amount} onValueChange={setAmount} placeholder="Valor" />

      <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
        {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Desde
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Hasta (opcional)
          <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {frequency !== "quincenal" && frequency !== "semanal" && frequency !== "cada_2_semanas" && (
        <p className="muted text-xs">Se repite el día {Number(startDate.slice(8, 10))} (o el último día si el mes es más corto).</p>
      )}
      {isBackfill && <p className="text-xs text-amber-700">La fecha de inicio ya pasó: se crearán también las ocurrencias desde esa fecha.</p>}

      <div className="grid grid-cols-2 gap-2">
        {(["compartido", "personal"] as const).map((s) => (
          <button key={s} className="chip" data-active={scope === s} onClick={() => { setScope(s); setCategoryId(""); }}>
            {s === "compartido" ? "🏠 Compartido" : "👤 Personal"}
          </button>
        ))}
      </div>
      <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Sin categoría (entra a Pendientes)</option>
        {catOptions.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Paga
          <select className="input" value={paidBy} onChange={(e) => { setPaidBy(e.target.value); setAccountId(""); }}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Cuenta
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Sin cuenta</option>
            {accounts.filter((a) => a.ownerId === paidBy).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="chip" data-active={autoIdentify} onClick={() => setAutoIdentify(true)}>Se registra sola</button>
        <button className="chip" data-active={!autoIdentify} onClick={() => setAutoIdentify(false)}>Entra a Pendientes</button>
      </div>
      <p className="muted text-xs">
        {autoIdentify
          ? "Ideal para efectivo o pagos que no mandan alerta: queda identificada en su fecha."
          : "Ideal si también llega la alerta del banco: aparece en Pendientes como recordatorio y la confirman o ignoran."}
      </p>

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onDone}>Cancelar</button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !name.trim() || !amount}
          onClick={() =>
            run(
              () =>
                saveRecurring({
                  id: item?.id ?? null,
                  name,
                  amount: amount ?? 0,
                  kind,
                  scope,
                  categoryId: categoryId || null,
                  accountId: accountId || null,
                  paidBy,
                  frequency,
                  startDate,
                  endDate: endDate || null,
                  autoIdentify,
                }),
              onDone,
            )
          }
        >
          {item ? "Guardar" : "Programar"}
        </button>
      </div>

      {item && (
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => run(() => setRecurringActive(item.id, !item.is_active), onDone)}>
            {item.is_active ? "Pausar" : "Reanudar"}
          </button>
          <button className="btn btn-ghost flex-1 text-red-600" disabled={busy} onClick={() => setConfirmDelete((v) => !v)}>
            Eliminar
          </button>
        </div>
      )}
      {item && confirmDelete && (
        <button className="btn bg-red-600 text-white" disabled={busy} onClick={() => run(() => deleteRecurring(item.id), onDone)}>
          Sí, eliminar (los movimientos ya creados se quedan)
        </button>
      )}
      {feedback}
    </div>
  );
}
