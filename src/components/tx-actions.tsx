"use client";

import { useState, useTransition } from "react";
import { deleteManualTransaction, reopenTransaction, setBudgetMonth, setTransactionPocket } from "@/app/(app)/actions";
import { monthLabel, shiftMonth } from "@/domain/dates";

export function TxActions({
  id,
  canReopen,
  canDelete,
  pockets = [],
  currentPocketId = null,
  dateMonth,
  budgetMonth = null,
}: {
  id: string;
  canReopen: boolean;
  canDelete: boolean;
  /** Bolsillos que sirven para este movimiento (mismo ámbito y dueño). */
  pockets?: { id: string; name: string }[];
  currentPocketId?: string | null;
  /** Mes de la fecha real (YYYY-MM) y mes del presupuesto si lo movieron. */
  dateMonth?: string;
  budgetMonth?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!canReopen && !canDelete && !dateMonth && pockets.length === 0 && !currentPocketId) return null;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) setOpen(false);
      else setError(r.error ?? "No se pudo");
    });

  return (
    <div className="relative">
      <button className="muted px-2 text-lg" aria-label="Opciones" onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <div className="card absolute right-0 top-8 z-10 flex w-56 flex-col p-1 text-sm shadow-lg">
          {pockets
            .filter((p) => p.id !== currentPocketId)
            .map((p) => (
              <button
                key={p.id}
                className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]"
                disabled={busy}
                onClick={() => act(() => setTransactionPocket(id, p.id))}
              >
                🐷 Pagado desde {p.name}
              </button>
            ))}
          {currentPocketId && (
            <button
              className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]"
              disabled={busy}
              onClick={() => act(() => setTransactionPocket(id, null))}
            >
              Quitar del bolsillo (vuelve al presupuesto)
            </button>
          )}
          {dateMonth && (
            <>
              {[shiftMonth(budgetMonth ?? dateMonth, 1), shiftMonth(budgetMonth ?? dateMonth, -1)]
                .filter((m) => m !== (budgetMonth ?? dateMonth))
                .map((m) => (
                  <button
                    key={m}
                    className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]"
                    disabled={busy}
                    onClick={() => act(() => setBudgetMonth(id, m))}
                  >
                    📅 Contar en {monthLabel(m)}
                  </button>
                ))}
              {budgetMonth && (
                <button className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]" disabled={busy} onClick={() => act(() => setBudgetMonth(id, null))}>
                  📅 Volver a {monthLabel(dateMonth)}
                </button>
              )}
            </>
          )}
          {canReopen && (
            <button className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]" disabled={busy} onClick={() => act(() => reopenTransaction(id))}>
              Volver a pendientes
            </button>
          )}
          {canDelete && (
            <button
              className="rounded-lg px-3 py-2 text-left text-red-600 hover:bg-[var(--bg)]"
              disabled={busy}
              onClick={() => {
                if (confirm("¿Eliminar este movimiento registrado a mano?")) act(() => deleteManualTransaction(id));
              }}
            >
              Eliminar
            </button>
          )}
          {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
