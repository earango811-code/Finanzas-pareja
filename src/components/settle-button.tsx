"use client";

import { useState, useTransition } from "react";
import { registerSettlement } from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";

export function SettleButton({ from, to, amount, date }: { from: string; to: string; amount: number; date: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number | null>(amount);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        Ya le transferí → registrar liquidación
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-left">
      <p className="muted text-xs">Valor transferido (puede ser un abono parcial):</p>
      <MoneyInput value={value} onValueChange={setValue} />
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>Cancelar</button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !value}
          onClick={() =>
            start(async () => {
              const r = await registerSettlement({ from, to, amount: value!, date });
              if (r.ok) setOpen(false);
              else setError(r.error);
            })
          }
        >
          Registrar
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
