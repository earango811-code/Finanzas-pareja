"use client";

import { useState } from "react";

interface Props {
  webhookUrl: string;
  memberId: string;
  secret: string | null; // null si el servidor no tiene INGEST_HMAC_SECRET
  status: { name: string; lastAt: string | null; created: number; unknown: number }[];
  unknownSamples: { at: string; text: string }[];
}

function CopyField({ label, value, hidden }: { label: string; value: string; hidden?: boolean }) {
  const [show, setShow] = useState(!hidden);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="muted text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <code className="input min-w-0 flex-1 truncate !py-2 font-mono text-xs">{show ? value : "•".repeat(24)}</code>
        {hidden && (
          <button className="chip shrink-0 !min-h-9 text-xs" onClick={() => setShow((v) => !v)}>
            {show ? "Ocultar" : "Ver"}
          </button>
        )}
        <button
          className="chip shrink-0 !min-h-9 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function ago(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

export function GmailConnect({ webhookUrl, memberId, secret, status, unknownSamples }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="card divide-y divide-[var(--line)] text-sm">
        {status.map((s) => (
          <li key={s.name} className="flex items-center gap-2 px-4 py-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.lastAt && Date.now() - Date.parse(s.lastAt) < 3 * 864e5 ? "bg-emerald-500" : "bg-slate-300"}`} />
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="muted text-xs">
              Última alerta {ago(s.lastAt)} · {s.created} este mes{s.unknown ? ` · ${s.unknown} sin entender` : ""}
            </span>
          </li>
        ))}
      </ul>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Conectar mi Gmail (Apps Script)</summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>Abre <a className="underline" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a> con TU cuenta de Gmail (la que recibe tus alertas).</li>
            <li>Pega el código de <code>integrations/apps-script/Code.gs</code> del repositorio.</li>
            <li>En ⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos, agrega estas tres:</li>
          </ol>
          {secret ? (
            <>
              <CopyField label="WEBHOOK_URL" value={webhookUrl} />
              <CopyField label="MEMBER_ID" value={memberId} />
              <CopyField label="SECRET (personal, no la compartas)" value={secret} hidden />
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Falta configurar <code>INGEST_HMAC_SECRET</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> en Vercel. Ver el README.
            </p>
          )}
          <ol start={4} className="list-decimal space-y-1 pl-5 text-xs">
            <li>Ejecuta <b>instalar</b> (Google te pide permiso para leer Gmail: es solo lectura) y luego <b>probarConexion</b>.</li>
            <li>Listo: cada 5 minutos tus alertas nuevas entran a Pendientes.</li>
          </ol>
          <p className="muted text-xs">Guía con capturas: <code>docs/gmail-apps-script.md</code>.</p>
        </div>
      </details>

      {unknownSamples.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Alertas que la app no entendió ({unknownSamples.length})</summary>
          <p className="muted mt-2 text-xs">
            No se crearon movimientos con estas. Si alguna es una compra o transferencia, regístrala a mano y comparte el
            texto para agregar el formato al lector.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {unknownSamples.map((u, i) => (
              <li key={i} className="rounded-lg bg-[var(--bg)] p-2 text-xs">
                <span className="muted">{ago(u.at)} · </span>
                {u.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
