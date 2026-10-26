"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createManualTransaction } from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";
import { formatCOP } from "@/domain/money";
import { parseQuickEntry } from "@/domain/quick-entry";
import type { TxScope } from "@/domain/types";
import type { CategoryOption } from "@/lib/categories";
import { visualFor } from "@/lib/visual";

interface Props {
  today: string;
  meId: string;
  members: { id: string; name: string }[];
  accounts: { id: string; name: string; type: string; ownerId: string }[];
  categories: CategoryOption[];
  pockets: { id: string; name: string; owner_member_id: string | null }[];
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QuickEntryForm({ today, meId, members, accounts, categories, pockets }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [kind, setKind] = useState<"gasto" | "ingreso">("gasto");
  const [merchant, setMerchant] = useState("");
  const [scope, setScope] = useState<TxScope | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState(meId);
  const [accountId, setAccountId] = useState<string | null>(
    accounts.find((a) => a.ownerId === meId && a.type === "efectivo")?.id ?? null,
  );
  const [date, setDate] = useState(today);
  const [pocketId, setPocketId] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();

  function applyText(value: string) {
    setText(value);
    // Subcategorías primero: ante un empate gana la más específica ("uber" → Uber, no Transporte).
    const r = parseQuickEntry(
      value,
      [...categories.filter((c) => c.parentId), ...categories.filter((c) => !c.parentId)],
      accounts.filter((a) => a.ownerId === paidBy),
    );
    if (r.amount !== null) setAmount(r.amount);
    if (r.scope) setScope(r.scope);
    if (r.categoryId) setCategoryId(r.categoryId);
    if (r.accountId) setAccountId(r.accountId);
    setMerchant(r.merchant);
    setDate(addDays(today, r.dayOffset));
  }

  const allowed = scope === "personal" ? ["personal", "ambas"] : scope === "compartido" ? ["compartida", "ambas"] : null;
  const catOptions = (allowed ? categories.filter((c) => allowed.includes(c.scope)) : categories).filter(
    (c) => c.isIncome === (kind === "ingreso") || kind === "ingreso",
  );
  const selected = categories.find((c) => c.id === categoryId);
  const openParent = selected ? (selected.parentId ?? selected.id) : null;
  const parentOptions = catOptions.filter((c) => !c.parentId);
  const childOptions = openParent ? catOptions.filter((c) => c.parentId === openParent) : [];
  const ownAccounts = accounts.filter((a) => a.ownerId === paidBy);
  // Compartido → bolsillos compartidos; personal → bolsillos de quien pagó
  const pocketChoices =
    scope === "compartido"
      ? pockets.filter((p) => p.owner_member_id === null)
      : scope === "personal"
        ? pockets.filter((p) => p.owner_member_id === paidBy)
        : [];

  function submit() {
    if (!amount) return setMsg({ text: "Falta el valor", error: true });
    start(async () => {
      const r = await createManualTransaction({
        amount,
        date,
        merchant,
        kind,
        scope,
        categoryId: kind === "gasto" || categoryId ? categoryId : null,
        accountId,
        paidBy,
        rawText: text || undefined,
        pocketId: kind === "gasto" && pocketChoices.some((p) => p.id === pocketId) ? pocketId : null,
      });
      if (!r.ok) return setMsg({ text: r.error, error: true });
      setMsg({ text: r.message ?? "Registrado" });
      setText("");
      setAmount(null);
      setMerchant("");
      setCategoryId(null);
      setScope(null);
      setPocketId("");
      setDate(today);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Dictado rápido</span>
        <input
          className="input"
          placeholder='Ej: "45 mil mercado D1 compartido"'
          value={text}
          onChange={(e) => applyText(e.target.value)}
          autoFocus
        />
        <span className="muted text-xs">
          Entiende “45 mil”, “45k”, “1,2 millones”, “ayer”, “compartido/personal”, “efectivo/tc”.
        </span>
      </label>

      <div className="card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          {(["gasto", "ingreso"] as const).map((k) => (
            <button key={k} className={`chip ${kind === k ? "" : ""}`} data-active={kind === k} onClick={() => setKind(k)}>
              {k === "gasto" ? "Gasto" : "Ingreso / reembolso"}
            </button>
          ))}
        </div>

        <MoneyInput value={amount} onValueChange={setAmount} placeholder="Valor" />
        <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />

        <div className="grid grid-cols-2 gap-2">
          {(["compartido", "personal"] as const).map((s) => (
            <button key={s} className="chip" data-active={scope === s} onClick={() => setScope(scope === s ? null : s)}>
              {s === "compartido" ? "🏠 Compartido" : "👤 Personal"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {parentOptions.map((c) => (
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
        {childOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-xl bg-[var(--bg)] p-2">
            {childOptions.map((c) => (
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
        )}

        {kind === "gasto" && pocketChoices.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="muted shrink-0">🐷 Pagado desde</span>
            <select className="input !py-1.5 text-sm" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              <option value="">— presupuesto del mes —</option>
              {pocketChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  Bolsillo {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Pagó
            <select
              className="input"
              value={paidBy}
              onChange={(e) => {
                setPaidBy(e.target.value);
                setAccountId(accounts.find((a) => a.ownerId === e.target.value && a.type === "efectivo")?.id ?? null);
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Cuenta
            <select className="input" value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value || null)}>
              <option value="">Sin cuenta</option>
              {ownAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <button className="btn btn-primary" disabled={busy || !amount} onClick={submit}>
        {busy ? "Guardando…" : `Guardar${amount ? ` ${formatCOP(amount)}` : ""}`}
      </button>
      <p className="muted text-center text-xs">Si falta ámbito o categoría, queda en Pendientes.</p>
      {msg && <p className={`text-center text-sm ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
    </div>
  );
}
