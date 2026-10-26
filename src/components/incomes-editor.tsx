"use client";

import { useState, useTransition } from "react";
import { updateIncomes } from "@/app/(app)/actions";
import { MoneyInput } from "@/components/money-input";
import { formatCOP, formatPct } from "@/domain/money";
import { splitShares } from "@/domain/split";

interface MemberIncome {
  id: string;
  name: string;
  monthly_income: number;
  income_deductions: number;
  deductions_note: string | null;
}

const EXAMPLE = 100_000;

export function IncomesEditor({ members }: { members: MemberIncome[] }) {
  const [rows, setRows] = useState(
    members.map((m) => ({ ...m, income: m.monthly_income as number | null, deductions: m.income_deductions as number | null, note: m.deductions_note ?? "" })),
  );
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();

  // Vista previa en vivo con la misma función que usa el cálculo de "quién le debe a quién"
  const preview = rows.map((r) => ({
    id: r.id,
    display_name: r.name,
    monthly_income: r.income ?? 0,
    income_deductions: r.deductions ?? 0,
  }));
  const shares = new Map(splitShares(preview).map((s) => [s.memberId, s.ratio]));
  const available = (r: (typeof rows)[number]) => Math.max(0, (r.income ?? 0) - (r.deductions ?? 0));
  const total = rows.reduce((a, r) => a + available(r), 0);
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function save() {
    start(async () => {
      const r = await updateIncomes(
        rows.map((x) => ({ id: x.id, monthly_income: x.income ?? 0, income_deductions: x.deductions ?? 0, deductions_note: x.note || null })),
      );
      setMsg(r.ok ? { text: r.message ?? "Guardado" } : { text: r.error, error: true });
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Ingreso disponible de los dos</h2>
          <span className="tabular text-xl font-bold">{formatCOP(total)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--line)]" role="img" aria-label="Reparto de los gastos compartidos">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`h-full ${i > 0 ? "border-l-2 border-[var(--card)]" : ""}`}
              style={{ width: `${(shares.get(r.id) ?? 0) * 100}%`, background: i === 0 ? "var(--color-brand)" : "var(--g-salidas)" }}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i === 0 ? "var(--color-brand)" : "var(--g-salidas)" }} />
              <span className="flex-1">{r.name}</span>
              <span className="tabular font-semibold">{formatPct(shares.get(r.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
        <p className="muted text-xs">
          Cada gasto compartido se reparte en proporción al ingreso disponible de cada uno. Ej.: de un gasto de {formatCOP(EXAMPLE)},{" "}
          {rows.map((r) => `${r.name} pone ${formatCOP(Math.round(EXAMPLE * (shares.get(r.id) ?? 0)))}`).join(" y ")}.
        </p>
      </section>

      {rows.map((r) => (
        <section key={r.id} className="card flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">{r.name}</h2>
            <span className="muted text-xs">Disponible {formatCOP(available(r))}</span>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            Ingreso mensual
            <MoneyInput value={r.income} onValueChange={(v) => set(r.id, { income: v })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Descuentos fijos (se restan antes de calcular el %)
            <MoneyInput value={r.deductions} onValueChange={(v) => set(r.id, { deductions: v })} />
          </label>
          <input
            className="input"
            placeholder="¿Qué es el descuento? (ej. cuota especialización)"
            value={r.note}
            maxLength={120}
            onChange={(e) => set(r.id, { note: e.target.value })}
          />
        </section>
      ))}

      <button className="btn btn-primary" disabled={busy} onClick={save}>
        {busy ? "Guardando…" : "Guardar ingresos"}
      </button>
      {msg && <p className={`text-center text-sm ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
      <p className="muted text-center text-xs">
        El presupuesto (pestaña Plan) también usa este total para ver si cubre el 100 % del ingreso.
      </p>
    </div>
  );
}
