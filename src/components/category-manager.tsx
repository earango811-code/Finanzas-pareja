"use client";

import { useState, useTransition } from "react";
import {
  addCategory,
  deleteCategory,
  setCategoryActive,
  updateCategory,
  type ActionResult,
} from "@/app/(app)/actions";
import { BUDGET_GROUP_LABEL, type BudgetGroup, type CategoryScope } from "@/domain/types";
import type { CategoryRow } from "@/lib/db-types";

const SCOPE_LABEL: Record<CategoryScope, string> = { compartida: "Compartida", personal: "Personal", ambas: "Ambas" };

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

export function CategoryManager({ categories, counts }: { categories: CategoryRow[]; counts: Record<string, number> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // id de la principal, o "root"

  const active = categories.filter((c) => c.is_active);
  const parents = active.filter((c) => !c.parent_id).sort((a, b) => Number(a.is_income) - Number(b.is_income) || a.sort_order - b.sort_order);
  const childrenOf = (id: string) => active.filter((c) => c.parent_id === id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const inactive = categories.filter((c) => !c.is_active);

  const row = (c: CategoryRow, isChild: boolean) => (
    <li key={c.id} className={isChild ? "" : "bg-[var(--bg)]/40"}>
      <button
        className={`flex w-full items-center gap-2 py-3 text-left ${isChild ? "pl-8 pr-4" : "px-4"}`}
        onClick={() => setEditing(editing === c.id ? null : c.id)}
      >
        <span aria-hidden className="muted text-sm">✏️</span>
        <span className={`min-w-0 flex-1 truncate ${isChild ? "" : "text-lg font-semibold"}`}>{c.name}</span>
        {!isChild && (
          <span className="muted shrink-0 text-[11px]">
            {c.is_income ? "Ingreso" : `${BUDGET_GROUP_LABEL[c.budget_group!]} · ${SCOPE_LABEL[c.scope]}`}
          </span>
        )}
        {counts[c.id] ? <span className="muted shrink-0 text-[11px]">{counts[c.id]} mov.</span> : null}
      </button>
      {editing === c.id && (
        <CategoryEditor category={c} categories={categories} count={counts[c.id] ?? 0} onDone={() => setEditing(null)} />
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <p className="muted text-xs">
        Toca una categoría para cambiarle el nombre, moverla o eliminarla. El presupuesto se define en las principales
        (desde Ajustes → Presupuesto); lo gastado en sus subcategorías suma a la principal.
      </p>

      {adding === "root" ? (
        <NewCategory parent={null} onDone={() => setAdding(null)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setAdding("root")}>+ Nueva categoría principal</button>
      )}

      {parents.map((p) => (
        <section key={p.id} className="card overflow-hidden">
          <ul className="divide-y divide-[var(--line)]">
            {row(p, false)}
            {childrenOf(p.id).map((c) => row(c, true))}
            <li>
              {adding === p.id ? (
                <NewCategory parent={p} onDone={() => setAdding(null)} />
              ) : (
                <button className="w-full py-3 pl-8 text-left text-sm font-medium text-[var(--color-brand)]" onClick={() => setAdding(p.id)}>
                  + Agregar subcategoría
                </button>
              )}
            </li>
          </ul>
        </section>
      ))}

      {inactive.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Desactivadas ({inactive.length})</summary>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {inactive.map((c) => (
              <InactiveRow key={c.id} category={c} parentName={categories.find((x) => x.id === c.parent_id)?.name} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CategoryEditor({
  category,
  categories,
  count,
  onDone,
}: {
  category: CategoryRow;
  categories: CategoryRow[];
  count: number;
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parent_id ?? "");
  const [scope, setScope] = useState<CategoryScope>(category.scope);
  const [group, setGroup] = useState<BudgetGroup | null>(category.budget_group);
  const [aliases, setAliases] = useState(category.aliases.join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const { busy, run, feedback } = useAction();

  const hasChildren = categories.some((c) => c.parent_id === category.id);
  // Puede ir debajo de cualquier principal del mismo tipo (gasto / ingreso), menos ella misma
  const parentOptions = categories.filter(
    (c) => !c.parent_id && c.id !== category.id && c.is_active && c.is_income === category.is_income,
  );
  const targets = categories.filter((c) => c.id !== category.id && c.is_active && c.is_income === category.is_income);

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--bg)] p-4 text-sm">
      <label className="flex flex-col gap-1 text-xs">
        Nombre
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        Ubicación
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={hasChildren}>
          <option value="">Categoría principal</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>Subcategoría de {p.name}</option>
          ))}
        </select>
        {hasChildren && <span className="muted">Tiene subcategorías, por eso no se puede mover.</span>}
      </label>

      {!parentId && !category.is_income && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Para
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as CategoryScope)}>
              {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Grupo 50/30/20
            <select className="input" value={group ?? ""} onChange={(e) => setGroup(e.target.value as BudgetGroup)}>
              {Object.entries(BUDGET_GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        Palabras clave (para el dictado), separadas por coma
        <input className="input" placeholder="uber, didi, taxi" value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </label>

      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          run(
            () =>
              updateCategory({
                id: category.id,
                name,
                parent_id: parentId || null,
                scope,
                budget_group: group,
                aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
              }),
            onDone,
          )
        }
      >
        Guardar cambios
      </button>

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => run(() => setCategoryActive(category.id, false), onDone)}>
          Desactivar
        </button>
        <button className="btn btn-ghost flex-1 text-red-600" disabled={busy || hasChildren} onClick={() => setConfirmDelete((v) => !v)}>
          Eliminar
        </button>
      </div>
      {hasChildren && <p className="muted text-xs">Para eliminarla, primero elimina o mueve sus subcategorías.</p>}

      {confirmDelete && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
          {count > 0 ? (
            <>
              <p className="text-xs">
                Tiene <b>{count} movimientos</b>. ¿A qué categoría los pasamos? (También se mueven sus reglas y recurrentes.)
              </p>
              <select className="input text-[var(--fg)]" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Elige una categoría…</option>
                {targets.map((t) => {
                  const parent = categories.find((c) => c.id === t.parent_id);
                  return <option key={t.id} value={t.id}>{parent ? `${parent.name} › ${t.name}` : t.name}</option>;
                })}
              </select>
            </>
          ) : (
            <p className="text-xs">No tiene movimientos. Se elimina junto con su presupuesto y reglas.</p>
          )}
          <button
            className="btn bg-red-600 text-white"
            disabled={busy || (count > 0 && !reassignTo)}
            onClick={() => run(() => deleteCategory({ id: category.id, reassignTo: reassignTo || null }), onDone)}
          >
            Eliminar definitivamente
          </button>
        </div>
      )}
      {feedback}
    </div>
  );
}

function NewCategory({ parent, onDone }: { parent: CategoryRow | null; onDone: () => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<CategoryScope>("ambas");
  const [group, setGroup] = useState<BudgetGroup>("necesidades");
  const { busy, run, feedback } = useAction();

  return (
    <div className={`flex flex-col gap-2 p-4 ${parent ? "pl-8" : "card"}`}>
      <input
        className="input"
        autoFocus
        placeholder={parent ? `Nueva subcategoría de ${parent.name}` : "Nombre de la categoría"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {!parent && (
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as CategoryScope)}>
            {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value as BudgetGroup)}>
            {Object.entries(BUDGET_GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onDone}>Cancelar</button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !name.trim()}
          onClick={() => run(() => addCategory({ name, scope, budget_group: group, parent_id: parent?.id ?? null }), onDone)}
        >
          Crear
        </button>
      </div>
      {feedback}
    </div>
  );
}

function InactiveRow({ category, parentName }: { category: CategoryRow; parentName?: string }) {
  const { busy, run, feedback } = useAction();
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <span className="muted min-w-0 flex-1 truncate">{parentName ? `${parentName} › ${category.name}` : category.name}</span>
      <button className="text-xs underline" disabled={busy} onClick={() => run(() => setCategoryActive(category.id, true))}>
        Activar
      </button>
      {feedback}
    </li>
  );
}
