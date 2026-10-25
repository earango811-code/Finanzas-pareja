"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addAccount,
  deleteRule,
  removeBudget,
  saveBudget,
  setAccountActive,
  setRuleAutoApply,
  updateAccount,
  updateMember,
  type ActionResult,
} from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";
import { formatCOP } from "@/domain/money";
import { BUDGET_GROUP_LABEL, type AccountType, type BudgetGroup, type CategoryScope } from "@/domain/types";
import type { AccountRow, BudgetRowDb, CategoryRow, MemberRow, RuleRow } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/client";

function useAction() {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error, error: true });
      if (r.ok) onOk?.();
      setTimeout(() => setMsg(null), 2500);
    });
  const feedback = msg && <p className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>;
  return { busy, run, feedback };
}

const ACCOUNT_LABEL: Record<AccountType, string> = { debito: "Débito / ahorros", credito: "Tarjeta de crédito", efectivo: "Efectivo", otro: "Otro" };

export function MemberEditor({ member, linked }: { member: MemberRow; linked: boolean }) {
  const [name, setName] = useState(member.display_name);
  const [income, setIncome] = useState<number | null>(member.monthly_income);
  const [deductions, setDeductions] = useState<number | null>(member.income_deductions);
  const [note, setNote] = useState(member.deductions_note ?? "");
  const { busy, run, feedback } = useAction();

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <input className="input flex-1 font-semibold" value={name} onChange={(e) => setName(e.target.value)} />
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${linked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {linked ? "Activo" : "Invitado"}
        </span>
      </div>
      <p className="muted text-xs">{member.email}{!linked && " — entra a la app con este correo para quedar vinculado"}</p>
      <label className="text-xs">Ingreso mensual<MoneyInput value={income} onValueChange={setIncome} /></label>
      <label className="text-xs">Descuentos fijos (se restan antes de calcular el %)<MoneyInput value={deductions} onValueChange={setDeductions} /></label>
      <input className="input" placeholder="Nota del descuento (ej. cuota especialización)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          run(() =>
            updateMember({ id: member.id, display_name: name, monthly_income: income ?? 0, income_deductions: deductions ?? 0, deductions_note: note || null }),
          )
        }
      >
        Guardar
      </button>
      {feedback}
    </div>
  );
}

export function AccountsEditor({ accounts, members }: { accounts: AccountRow[]; members: { id: string; name: string }[] }) {
  const [owner, setOwner] = useState(members[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("debito");
  const [last4, setLast4] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const { busy, run, feedback } = useAction();
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-3">
      <ul className="card divide-y divide-[var(--line)]">
        {accounts.map((a) => (
          <AccountRowEditor key={a.id} account={a} owner={memberName(a.owner_member_id)} />
        ))}
      </ul>
      <p className="muted -mt-1 text-xs">
        Desactiva una cuenta que no deba contar (ej. una tarjeta de la empresa): sus alertas entran como ignoradas y no
        aparecen en Pendientes ni en el presupuesto.
      </p>

      <div className="card flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold">Agregar cuenta</p>
        <input className="input" placeholder="Nombre (ej. TC Bancolombia Mastercard)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input
          className="input"
          inputMode="numeric"
          maxLength={4}
          placeholder="Últimos 4 dígitos (como salen en las alertas)"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
        />
        {type === "debito" && (
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            placeholder="Últimos 4 de la tarjeta débito (opcional)"
            value={cardLast4}
            onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ""))}
          />
        )}
        <p className="muted text-xs">
          Nunca escribas el número completo. Las transferencias traen los 4 de la cuenta (*5678) y las compras con débito los
          de la tarjeta (T.Deb *1234): pon ambos para que las dos lleguen a la misma cuenta.
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || !name}
          onClick={() =>
            run(
              () => addAccount({ owner_member_id: owner, name, type, last4: last4 || null, card_last4: cardLast4 || null }),
              () => { setName(""); setLast4(""); setCardLast4(""); },
            )
          }
        >
          Agregar
        </button>
        {feedback}
      </div>
    </div>
  );
}

function AccountRowEditor({ account: a, owner }: { account: AccountRow; owner: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(a.name);
  const [last4, setLast4] = useState(a.last4 ?? "");
  const [cardLast4, setCardLast4] = useState(a.card_last4 ?? "");
  const { busy, run, feedback } = useAction();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <li className={`px-4 py-3 text-sm ${a.is_active ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <p className="truncate font-medium">
            {a.name}
            {a.last4 && <span className="muted"> *{a.last4}</span>}
            {a.card_last4 && <span className="muted"> · tarjeta *{a.card_last4}</span>}
          </p>
          <p className="muted text-xs">{ACCOUNT_LABEL[a.type]} · {owner}</p>
        </button>
        <button className="text-xs underline" disabled={busy} onClick={() => run(() => setAccountActive(a.id, !a.is_active))}>
          {a.is_active ? "Desactivar" : "Activar"}
        </button>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          {a.type !== "efectivo" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="numeric" placeholder="Últimos 4" value={last4} onChange={(e) => setLast4(digits(e.target.value))} />
              {a.type === "debito" && (
                <input className="input" inputMode="numeric" placeholder="Tarjeta débito" value={cardLast4} onChange={(e) => setCardLast4(digits(e.target.value))} />
              )}
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || !name}
            onClick={() =>
              run(() => updateAccount({ id: a.id, name, last4: last4 || null, card_last4: cardLast4 || null }), () => setOpen(false))
            }
          >
            Guardar
          </button>
          {feedback}
        </div>
      )}
    </li>
  );
}

export function BudgetEditor({
  categories,
  budgets,
  members,
}: {
  categories: CategoryRow[];
  budgets: BudgetRowDb[];
  members: { id: string; name: string }[];
}) {
  const [view, setView] = useState<string>("compartido");
  const memberId = view === "compartido" ? null : view;
  const allowed: CategoryScope[] = memberId === null ? ["compartida", "ambas"] : ["personal", "ambas"];
  // El presupuesto va solo en categorías principales de gasto
  const list = categories.filter((c) => allowed.includes(c.scope) && !c.parent_id && !c.is_income);
  const subsOf = (id: string) => categories.filter((c) => c.parent_id === id).map((c) => c.name);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        <button className="chip shrink-0" data-active={view === "compartido"} onClick={() => setView("compartido")}>🏠 Compartido</button>
        {members.map((m) => (
          <button key={m.id} className="chip shrink-0" data-active={view === m.id} onClick={() => setView(m.id)}>👤 {m.name}</button>
        ))}
      </div>
      <ul className="card divide-y divide-[var(--line)]">
        {list.map((c) => (
          <BudgetLine
            key={`${c.id}-${view}`}
            category={c}
            subcategories={subsOf(c.id)}
            memberId={memberId}
            budget={budgets.find((b) => b.category_id === c.id && b.member_id === memberId) ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

function BudgetLine({
  category,
  subcategories,
  memberId,
  budget,
}: {
  category: CategoryRow;
  subcategories: string[];
  memberId: string | null;
  budget: BudgetRowDb | null;
}) {
  const [mode, setMode] = useState<"fijo" | "resto">(budget?.mode ?? "fijo");
  const [amount, setAmount] = useState<number | null>(budget?.amount ?? null);
  const [share, setShare] = useState<number>(Math.round((budget?.remainder_share ?? 0.5) * 100));
  const [editing, setEditing] = useState(false);
  const { busy, run, feedback } = useAction();

  const summary = !budget ? "Sin presupuesto" : budget.mode === "fijo" ? formatCOP(budget.amount) : `${Math.round(budget.remainder_share * 100)} % del resto`;

  return (
    <li className="px-4 py-3 text-sm">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setEditing((v) => !v)}>
        <span className="min-w-0">
          <span className="block truncate">
            {category.name}
            {category.budget_group && <span className="muted text-xs"> · {BUDGET_GROUP_LABEL[category.budget_group]}</span>}
          </span>
          {subcategories.length > 0 && <span className="muted block truncate text-xs">{subcategories.join(" · ")}</span>}
        </span>
        <span className={`tabular shrink-0 ${budget ? "font-semibold" : "muted text-xs"}`}>{summary}</span>
      </button>
      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button className="chip" data-active={mode === "fijo"} onClick={() => setMode("fijo")}>Monto fijo</button>
            <button className="chip" data-active={mode === "resto"} onClick={() => setMode("resto")}>% del resto</button>
          </div>
          {mode === "fijo" ? (
            <MoneyInput value={amount} onValueChange={setAmount} placeholder="Monto mensual" />
          ) : (
            <label className="flex items-center gap-2">
              <input className="input w-24" inputMode="numeric" value={share} onChange={(e) => setShare(Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0))} />
              % de lo que sobra
            </label>
          )}
          <div className="flex gap-2">
            {budget && (
              <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => run(() => removeBudget(budget.id), () => setEditing(false))}>
                Quitar
              </button>
            )}
            <button
              className="btn btn-primary flex-1"
              disabled={busy}
              onClick={() =>
                run(
                  () => saveBudget({ categoryId: category.id, memberId, mode, amount: amount ?? 0, remainderShare: share / 100 }),
                  () => setEditing(false),
                )
              }
            >
              Guardar
            </button>
          </div>
          {feedback}
        </div>
      )}
    </li>
  );
}

export function RulesList({ rules }: { rules: (RuleRow & { categoryName: string | null })[] }) {
  const { busy, run, feedback } = useAction();
  if (rules.length === 0) {
    return <p className="muted text-sm">Aún no hay reglas. Se crean al marcar “Recordar para este comercio” en Pendientes.</p>;
  }
  return (
    <>
      <ul className="card divide-y divide-[var(--line)]">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                Si contiene <b>“{r.pattern}”</b>
              </p>
              <p className="muted text-xs">
                → {r.categoryName ?? r.kind} {r.scope && `· ${r.scope}`}
                {r.hits > 0 && ` · usada ${r.hits} ${r.hits === 1 ? "vez" : "veces"}`}
              </p>
            </div>
            <button
              className="chip shrink-0 !min-h-8 !px-2 !py-1 text-xs"
              data-active={r.auto_apply}
              disabled={busy}
              title={r.auto_apply ? "Las alertas de este comercio se clasifican solas" : "Solo se sugiere en Pendientes"}
              onClick={() => run(() => setRuleAutoApply(r.id, !r.auto_apply))}
            >
              {r.auto_apply ? "Automática" : "Sugerencia"}
            </button>
            <button className="text-xs text-red-600 underline" disabled={busy} onClick={() => run(() => deleteRule(r.id))}>
              Borrar
            </button>
          </li>
        ))}
      </ul>
      {feedback}
    </>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
