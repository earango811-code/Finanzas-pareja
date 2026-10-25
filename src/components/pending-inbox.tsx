"use client";

import { useMemo, useState, useTransition } from "react";
import {
  classifyTransactions,
  ignoreTransactions,
  markAsTransfer,
  type ActionResult,
} from "@/app/(app)/actions";
import { shortDate } from "@/domain/dates";
import { formatCOP } from "@/domain/money";
import type { Suggestion } from "@/domain/rules";
import type { TxKind, TxScope, TxSource } from "@/domain/types";
import type { CategoryOption } from "@/lib/categories";

export interface PendingCard {
  id: string;
  amount: number;
  kind: TxKind;
  merchant: string;
  date: string;
  account: string | null;
  paidBy: string;
  isMine: boolean;
  source: TxSource;
  suggestion: Suggestion | null;
}

const SOURCE_LABEL: Record<TxSource, string> = {
  email: "correo",
  notificacion: "notificación",
  csv: "extracto",
  manual: "manual",
  recurrente: "🔁 recurrente",
};

/**
 * Categorías que aplican según ámbito y tipo. En un ingreso salen primero las de
 * ingreso (Salario…) y luego las de gasto (para reembolsos); en un gasto, nunca las de ingreso.
 */
function categoriesFor(scope: TxScope, all: CategoryOption[], kind: TxKind) {
  const allowed = scope === "compartido" ? ["compartida", "ambas"] : ["personal", "ambas"];
  const list = all.filter((c) => allowed.includes(c.scope));
  if (kind === "ingreso") return [...list.filter((c) => c.isIncome), ...list.filter((c) => !c.isIncome)];
  return list.filter((c) => !c.isIncome);
}

export function PendingInbox({ cards, categories }: { cards: PendingCard[]; categories: CategoryOption[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const catName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return new Map(
      categories.map((c) => [c.id, c.parentId ? `${byId.get(c.parentId)?.name} › ${c.name}` : c.name]),
    );
  }, [categories]);

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn();
      setToast(r.ok ? { text: r.message ?? "Listo" } : { text: r.error, error: true });
      if (r.ok) {
        setOpenId(null);
        setSelected(new Set());
        setSelecting(false);
      }
      setTimeout(() => setToast(null), 2500);
    });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-24 text-center">
        <div className="text-5xl">🎉</div>
        <p className="text-lg font-semibold">Todo identificado</p>
        <p className="muted text-sm">Cuando entre un movimiento nuevo aparecerá aquí.</p>
      </div>
    );
  }

  const selectedIds = [...selected];

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex justify-end">
        <button
          className="text-sm font-medium text-[var(--color-brand)]"
          onClick={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
            setOpenId(null);
          }}
        >
          {selecting ? "Cancelar selección" : "Seleccionar varios"}
        </button>
      </div>

      {cards.map((c) => {
        const open = openId === c.id && !selecting;
        const s = c.suggestion;
        return (
          <article key={c.id} className={`card overflow-hidden ${selected.has(c.id) ? "ring-2 ring-[var(--color-brand)]" : ""}`}>
            <button
              className="flex w-full items-start gap-3 p-4 text-left"
              onClick={() => (selecting ? toggle(c.id) : setOpenId(open ? null : c.id))}
            >
              {selecting && (
                <span className={`mt-1 h-5 w-5 shrink-0 rounded-md border-2 ${selected.has(c.id) ? "border-[var(--color-brand)] bg-[var(--color-brand)]" : "border-[var(--line)]"}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.merchant}</p>
                <p className="muted mt-0.5 truncate text-xs">
                  {shortDate(c.date)} · {c.account ?? "Sin cuenta"} · {SOURCE_LABEL[c.source]}
                </p>
                <span
                  className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${c.isMine ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]" : "bg-purple-100 text-purple-700"}`}
                >
                  Pagó: {c.paidBy}
                </span>
              </div>
              <p className={`tabular shrink-0 text-lg font-bold ${c.kind === "ingreso" ? "text-emerald-600" : ""}`}>
                {c.kind === "ingreso" ? "+" : ""}
                {formatCOP(c.amount)}
              </p>
            </button>

            {s && !selecting && (s.categoryId || s.kind) && (
              <div className="flex items-center gap-2 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm">
                <span className="muted flex-1 truncate">
                  Sugerido ({s.source}): <b>{s.categoryId ? catName.get(s.categoryId) : s.kind}</b>
                  {s.scope && ` · ${s.scope}`}
                </span>
                <button
                  className="btn btn-primary !min-h-9 !px-3 !py-1 text-sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      s.categoryId && s.scope
                        ? classifyTransactions({ ids: [c.id], scope: s.scope, categoryId: s.categoryId })
                        : s.kind === "transferencia_interna" || s.kind === "pago_tarjeta"
                          ? markAsTransfer({ ids: [c.id], kind: s.kind })
                          : Promise.resolve({ ok: false, error: "Sugerencia incompleta" }),
                    )
                  }
                >
                  ✓ Aceptar
                </button>
              </div>
            )}

            {open && (
              <Classifier
                categories={categories}
                busy={pending}
                defaultScope={s?.scope ?? null}
                kind={c.kind}
                onClassify={(scope, categoryId, remember) => run(() => classifyTransactions({ ids: [c.id], scope, categoryId, remember }))}
                onTransfer={(kind) => run(() => markAsTransfer({ ids: [c.id], kind }))}
                onIgnore={() => run(() => ignoreTransactions([c.id]))}
              />
            )}
          </article>
        );
      })}

      {selecting && selectedIds.length > 0 && (
        <div className="card fixed inset-x-3 bottom-24 z-30 mx-auto max-w-2xl shadow-xl">
          <p className="px-4 pt-3 text-sm font-semibold">{selectedIds.length} seleccionados</p>
          <Classifier
            categories={categories}
            busy={pending}
            defaultScope={null}
            kind={selectedIds.every((id) => cards.find((x) => x.id === id)?.kind === "ingreso") ? "ingreso" : "gasto"}
            onClassify={(scope, categoryId, remember) => run(() => classifyTransactions({ ids: selectedIds, scope, categoryId, remember }))}
            onTransfer={(kind) => run(() => markAsTransfer({ ids: selectedIds, kind }))}
            onIgnore={() => run(() => ignoreTransactions(selectedIds))}
          />
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed inset-x-0 top-4 z-40 mx-auto w-fit rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.error ? "bg-red-600" : "bg-slate-900"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Classifier({
  categories,
  busy,
  defaultScope,
  kind,
  onClassify,
  onTransfer,
  onIgnore,
}: {
  categories: CategoryOption[];
  busy: boolean;
  defaultScope: TxScope | null;
  kind: TxKind;
  onClassify: (scope: TxScope, categoryId: string, remember: boolean) => void;
  onTransfer: (kind: "transferencia_interna" | "pago_tarjeta") => void;
  onIgnore: () => void;
}) {
  const [scope, setScope] = useState<TxScope | null>(defaultScope);
  const [remember, setRemember] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const options = scope ? categoriesFor(scope, categories, kind) : [];
  // Atajos: las 8 más usadas que se pueden elegir directo (subcategorías o principales sin hijas).
  const quick = options.filter((c) => !c.hasChildren).slice(0, 8);
  const parents = options.filter((c) => !c.parentId);
  const childrenOf = (id: string) => options.filter((c) => c.parentId === id);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] p-4">
      <div className="grid grid-cols-2 gap-2">
        {(["compartido", "personal"] as const).map((s) => (
          <button
            key={s}
            className={`btn ${scope === s ? (s === "compartido" ? "bg-[var(--color-shared)] text-white" : "bg-[var(--color-personal)] text-white") : "btn-ghost"}`}
            onClick={() => setScope(s)}
          >
            {s === "compartido" ? "🏠 Compartido" : "👤 Personal"}
          </button>
        ))}
      </div>

      {scope && (
        <>
          {!showAll ? (
            <div className="flex flex-wrap gap-2">
              {quick.map((c) => (
                <button key={c.id} className="chip" disabled={busy} onClick={() => onClassify(scope, c.id, remember)}>
                  {c.name}
                </button>
              ))}
              <button className="chip muted" onClick={() => setShowAll(true)}>Todas…</button>
            </div>
          ) : (
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
              {parents.map((p) => {
                const kids = childrenOf(p.id);
                return (
                  <div key={p.id}>
                    <p className="muted mb-1 text-xs font-semibold uppercase tracking-wide">{p.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {kids.map((c) => (
                        <button key={c.id} className="chip" disabled={busy} onClick={() => onClassify(scope, c.id, remember)}>
                          {c.name}
                        </button>
                      ))}
                      <button
                        className={`chip ${kids.length ? "muted" : ""}`}
                        disabled={busy}
                        onClick={() => onClassify(scope, p.id, remember)}
                      >
                        {kids.length ? `${p.name} (general)` : p.name}
                      </button>
                    </div>
                  </div>
                );
              })}
              <button className="chip muted self-start" onClick={() => setShowAll(false)}>Menos</button>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
            Recordar para este comercio
          </label>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-dashed border-[var(--line)] pt-3 text-sm">
        <button className="chip" disabled={busy} onClick={() => onTransfer("transferencia_interna")}>
          ↔ Transferencia interna
        </button>
        <button className="chip" disabled={busy} onClick={() => onTransfer("pago_tarjeta")}>
          💳 Pago de tarjeta
        </button>
        <button className="chip muted" disabled={busy} onClick={onIgnore}>
          Ignorar
        </button>
      </div>
    </div>
  );
}
