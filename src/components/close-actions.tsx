"use client";

import { useState, useTransition } from "react";
import { closeMonth, reopenMonth, transferSavingsToPockets } from "@/app/(app)/cierre/actions";

type Kind = "transfer" | "close" | "reopen";

const LABEL: Record<Kind, string> = {
  transfer: "Pasar los saldos a los bolsillos",
  close: "Cerrar el mes",
  reopen: "Reabrir el mes",
};

/** Botón de una acción del cierre con su mensaje de resultado. */
export function CloseAction({ kind, month, disabled = false }: { kind: Kind; month: string; disabled?: boolean }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fn = kind === "transfer" ? transferSavingsToPockets : kind === "close" ? closeMonth : reopenMonth;

  return (
    <div className="flex flex-col gap-1">
      <button
        className={`btn ${kind === "reopen" ? "btn-ghost" : "btn-primary"}`}
        disabled={busy || disabled}
        onClick={() => {
          if (kind === "close" && !confirm("¿Cerrar el mes? Se guarda el ingreso final de cada uno.")) return;
          start(async () => {
            const r = await fn(month);
            setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error, error: true });
          });
        }}
      >
        {busy ? "Un momento…" : LABEL[kind]}
      </button>
      {msg && <p className={`text-center text-xs ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
    </div>
  );
}
