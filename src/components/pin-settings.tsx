"use client";

import { useState, useTransition } from "react";
import { setMyPin, setPartnerPin, type ActionResult } from "@/app/(app)/actions";

function PinForm({
  title,
  help,
  button,
  action,
}: {
  title: string;
  help: string;
  button: string;
  action: (input: { pin: string; confirm: string }) => Promise<ActionResult>;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <div className="card flex flex-col gap-2 p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="muted text-xs">{help}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input text-center text-xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
        />
        <input
          className="input text-center text-xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="Repite"
          value={confirm}
          onChange={(e) => setConfirm(digits(e.target.value))}
        />
      </div>
      <button
        className="btn btn-primary"
        disabled={busy || pin.length < 4 || confirm.length < 4}
        onClick={() =>
          start(async () => {
            const r = await action({ pin, confirm });
            setMsg(r.ok ? { text: r.message ?? "Listo" } : { text: r.error, error: true });
            if (r.ok) {
              setPin("");
              setConfirm("");
            }
          })
        }
      >
        {busy ? "Guardando…" : button}
      </button>
      {msg && <p className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
    </div>
  );
}

export function PinSettings({
  myPinSet,
  partner,
}: {
  myPinSet: boolean;
  partner: { name: string; email: string; linked: boolean; pinSet: boolean } | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <PinForm
        title={myPinSet ? "Cambiar mi PIN" : "Crear mi PIN"}
        help="4 números para entrar desde el computador o el celular con tu correo. No uses el PIN del banco ni 1234."
        button={myPinSet ? "Cambiar PIN" : "Crear PIN"}
        action={setMyPin}
      />
      {partner && (
        <PinForm
          title={partner.pinSet ? `Restablecer el PIN de ${partner.name}` : `Crear el acceso de ${partner.name}`}
          help={
            partner.pinSet
              ? `Úsalo solo si ${partner.name} olvidó su PIN. Después puede cambiarlo en su Ajustes.`
              : `${partner.name} podrá entrar con ${partner.email} y este PIN. Pásaselo en persona; después puede cambiarlo.`
          }
          button={partner.pinSet ? "Restablecer PIN" : "Crear acceso"}
          action={setPartnerPin}
        />
      )}
    </div>
  );
}
