"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteManualTransaction, setTransactionIgnored, updateTransaction } from "@/app/(app)/actions";
import { CatIcon } from "@/components/cat-icon";
import { MoneyInput } from "@/components/money-input";
import { monthLabel, shiftMonth } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import { KIND_LABEL, type TxKind, type TxScope, type TxStatus } from "@/domain/types";
import type { CategoryOption } from "@/lib/categories";
import { visualFor } from "@/lib/visual";

export interface EditableTx {
  id: string;
  kind: TxKind;
  amount: number;
  date: string;
  budgetMonth: string | null;
  scope: TxScope | null;
  categoryId: string | null;
  paidBy: string;
  counterpartyId: string | null;
  accountId: string | null;
  pocketId: string | null;
  merchant: string;
  notes: string;
  status: TxStatus;
  canDelete: boolean;
}

interface Props {
  tx: EditableTx;
  backHref: string;
  members: { id: string; name: string }[];
  accounts: { id: string; name: string; ownerId: string }[];
  categories: CategoryOption[];
  pockets: { id: string; name: string; owner_member_id: string | null }[];
}

const KINDS: TxKind[] = ["gasto", "ingreso", "transferencia_interna", "pago_tarjeta", "liquidacion"];
const STATUS_LABEL: Record<TxStatus, string> = { identificado: "✓ Identificado", pendiente: "⏳ Pendiente", ignorado: "🚫 Ignorado" };

export function TxEditor({ tx, backHref, members, accounts, categories, pockets }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<TxKind>(tx.kind);
  const [amount, setAmount] = useState<number | null>(tx.amount);
  const [date, setDate] = useState(tx.date);
  const [budgetMonth, setBudgetMonth] = useState(tx.budgetMonth ?? tx.date.slice(0, 7));
  const [scope, setScope] = useState<TxScope | null>(tx.scope);
  const [categoryId, setCategoryId] = useState<string | null>(tx.categoryId);
  const [paidBy, setPaidBy] = useState(tx.paidBy);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(tx.counterpartyId);
  const [accountId, setAccountId] = useState<string | null>(tx.accountId);
  const [pocketId, setPocketId] = useState(tx.pocketId ?? "");
  const [merchant, setMerchant] = useState(tx.merchant);
  const [notes, setNotes] = useState(tx.notes);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();

  const isSpend = kind === "gasto" || kind === "ingreso";
  const dateMonth = date.slice(0, 7);
  const monthChoices = [shiftMonth(dateMonth, -1), dateMonth, shiftMonth(dateMonth, 1)];
  if (!monthChoices.includes(budgetMonth)) monthChoices.push(budgetMonth);

  const catOptions = categories.filter((c) => kind === "ingreso" || !c.isIncome);
  const selected = categories.find((c) => c.id === categoryId);
  const openParent = selected ? (selected.parentId ?? selected.id) : null;
  const groups = catOptions.filter((c) => !c.parentId);
  const children = openParent ? catOptions.filter((c) => c.parentId === openParent) : [];
  const ownAccounts = accounts.filter((a) => a.ownerId === paidBy);
  const pocketChoices =
    scope === "compartido"
      ? pockets.filter((p) => p.owner_member_id === null)
      : scope === "personal"
        ? pockets.filter((p) => p.owner_member_id === paidBy)
        : [];

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error ?? "No se pudo", error: true });
      if (r.ok) {
        router.refresh();
        after?.();
      }
    });

  function save() {
    if (!amount) return setMsg({ text: "Falta el valor", error: true });
    run(() =>
      updateTransaction({
        id: tx.id,
        kind,
        amount,
        date,
        budgetMonth: budgetMonth === dateMonth ? null : budgetMonth,
        scope,
        categoryId: kind === "gasto" || kind === "ingreso" ? categoryId : null,
        paidBy,
        counterpartyId: kind === "liquidacion" ? counterpartyId : null,
        accountId,
        pocketId: isSpend && pocketChoices.some((p) => p.id === pocketId) ? pocketId : null,
        merchant,
        notes,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <div className="card flex flex-col items-center gap-2 p-5">
        <CatIcon
          visual={isSpend ? visualFor(categoryId, categories) : { color: "var(--g-neutral)", icon: kind === "liquidacion" ? "⚖️" : kind === "pago_tarjeta" ? "💳" : "↔️" }}
          size={52}
        />
        <MoneyInput value={amount} onValueChange={setAmount} placeholder="Valor" />
        <span className="muted text-xs">{STATUS_LABEL[tx.status]}</span>
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs">
          Tipo
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as TxKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Fecha
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => {
                const d = e.target.value;
                if (!d) return;
                // Si el mes del presupuesto seguía la fecha, que la siga
                if (budgetMonth === dateMonth) setBudgetMonth(d.slice(0, 7));
                setDate(d);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Cuenta en el presupuesto de
            <select className="input capitalize" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)}>
              {monthChoices.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isSpend && (
        <section className="card flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {(["compartido", "personal"] as const).map((s) => (
              <button key={s} className="chip" data-active={scope === s} onClick={() => setScope(scope === s ? null : s)}>
                {s === "compartido" ? "🏠 Compartido" : "👤 Personal"}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold">Grupo {kind === "ingreso" ? "(opcional)" : ""}</p>
          <div className="flex flex-wrap gap-2">
            {groups.map((c) => (
              <button
                key={c.id}
                className="chip"
                data-active={openParent === c.id}
                onClick={() => setCategoryId(openParent === c.id ? null : c.id)}
              >
                <span aria-hidden>{visualFor(c.id, categories).icon}</span> {c.name}
              </button>
            ))}
          </div>
          {children.length > 0 && (
            <>
              <p className="text-xs font-semibold">Categoría (opcional)</p>
              <div className="flex flex-wrap gap-2 rounded-xl bg-[var(--bg)] p-2">
                {children.map((c) => (
                  <button
                    key={c.id}
                    className="chip"
                    data-active={categoryId === c.id}
                    onClick={() => setCategoryId(categoryId === c.id ? openParent : c.id)}
                  >
                    <span aria-hidden>{visualFor(c.id, categories).icon}</span> {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {pocketChoices.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="muted shrink-0">🐷 Pagado desde</span>
              <select className="input !py-1.5 text-sm" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
                <option value="">— presupuesto del mes —</option>
                {pocketChoices.map((p) => (
                  <option key={p.id} value={p.id}>Bolsillo {p.name}</option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <section className="card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {kind === "liquidacion" ? "Pagó" : kind === "ingreso" ? "Lo recibió" : "Pagó"}
            <select
              className="input"
              value={paidBy}
              onChange={(e) => {
                setPaidBy(e.target.value);
                if (!accounts.some((a) => a.id === accountId && a.ownerId === e.target.value)) setAccountId(null);
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          {kind === "liquidacion" ? (
            <label className="flex flex-col gap-1 text-xs">
              Le pagó a
              <select className="input" value={counterpartyId ?? ""} onChange={(e) => setCounterpartyId(e.target.value || null)}>
                <option value="">Elige…</option>
                {members.filter((m) => m.id !== paidBy).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs">
              Cuenta
              <select className="input" value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value || null)}>
                <option value="">Sin cuenta</option>
                {ownAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1 text-xs">
          Descripción
          <input className="input" value={merchant} maxLength={120} placeholder="Ej: D1, arriendo…" onChange={(e) => setMerchant(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Nota
          <textarea className="input min-h-20" value={notes} maxLength={500} placeholder="Algo para recordar" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>

      <button className="btn btn-primary" disabled={busy || !amount} onClick={save}>
        {busy ? "Guardando…" : `Guardar cambios${amount ? ` · ${formatCOP(amount)}` : ""}`}
      </button>
      {msg && <p className={`text-center text-sm ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}

      <div className="flex gap-2">
        <button
          className="btn btn-ghost flex-1"
          disabled={busy}
          onClick={() => run(() => setTransactionIgnored(tx.id, tx.status !== "ignorado"))}
        >
          {tx.status === "ignorado" ? "Volver a contarlo" : "Ignorar"}
        </button>
        {tx.canDelete && (
          <button
            className="btn btn-ghost flex-1 text-red-600"
            disabled={busy}
            onClick={() => {
              if (confirm("¿Eliminar este movimiento?")) run(() => deleteManualTransaction(tx.id), () => router.push(backHref));
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
