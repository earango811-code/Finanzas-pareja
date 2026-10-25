"use client";

import { useState, useTransition } from "react";
import { deleteManualTransaction, reopenTransaction } from "@/app/(app)/actions";

export function TxActions({ id, canReopen, canDelete }: { id: string; canReopen: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  if (!canReopen && !canDelete) return null;

  return (
    <div className="relative">
      <button className="muted px-2 text-lg" aria-label="Opciones" onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <div className="card absolute right-0 top-8 z-10 flex w-48 flex-col p-1 text-sm shadow-lg">
          {canReopen && (
            <button
              className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg)]"
              disabled={busy}
              onClick={() => start(async () => { await reopenTransaction(id); setOpen(false); })}
            >
              Volver a pendientes
            </button>
          )}
          {canDelete && (
            <button
              className="rounded-lg px-3 py-2 text-left text-red-600 hover:bg-[var(--bg)]"
              disabled={busy}
              onClick={() => {
                if (confirm("¿Eliminar este movimiento registrado a mano?")) {
                  start(async () => { await deleteManualTransaction(id); setOpen(false); });
                }
              }}
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
