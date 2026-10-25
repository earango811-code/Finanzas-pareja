"use client";

// Entrada principal: correo + PIN de 4 dígitos (funciona igual en computador,
// celular y la app instalada). Respaldo: enlace al correo, para la primera vez
// o si alguien olvidó el PIN.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

const EMAIL_KEY = "finanzas:ultimo-correo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const linkFailed = useSearchParams().get("error") === "enlace";
  const [mode, setMode] = useState<"pin" | "link" | "sent">(linkFailed ? "link" : "pin");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkFailed ? "El enlace no sirvió (venció o se abrió en otro navegador). Pide uno nuevo." : null,
  );
  const pinRef = useRef<HTMLInputElement>(null);

  // Recordar el último correo para que en el celular solo haya que poner el PIN
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        pinRef.current?.focus();
      }
    } catch {
      /* navegación privada: no pasa nada */
    }
  }, []);

  function rememberEmail() {
    try {
      localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
    } catch {
      /* sin almacenamiento */
    }
  }

  async function loginWithPin(value: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), pin: value }),
    });
    setBusy(false);
    if (res.ok) {
      rememberEmail();
      router.replace("/pendientes");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "No se pudo entrar");
    setPin("");
    pinRef.current?.focus();
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(
        /rate limit|security purposes/i.test(error.message)
          ? "Supabase limita los correos de inicio de sesión. Espera un rato e intenta de nuevo."
          : error.message,
      );
    } else {
      rememberEmail();
      setMode("sent");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("Código inválido o vencido. Pide uno nuevo.");
    else {
      router.replace("/pendientes");
      router.refresh();
    }
  }

  const emailInput = (
    <input
      className="input"
      type="email"
      inputMode="email"
      autoComplete="username"
      placeholder="tucorreo@gmail.com"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
    />
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <Logo size={64} className="mb-4 rounded-2xl shadow-md" />
        <h1 className="text-2xl font-bold">Finanzas en pareja</h1>
        <p className="muted mt-1">
          {mode === "pin" ? "Entra con tu correo y tu PIN." : "Te enviamos un enlace al correo para entrar."}
        </p>
      </div>

      {mode === "pin" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 4) loginWithPin(pin);
          }}
        >
          {emailInput}
          <label className="flex flex-col gap-1 text-sm">
            PIN
            <input
              ref={pinRef}
              className="input text-center text-3xl tracking-[0.8em]"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(v);
                if (v.length === 4 && email.includes("@") && !busy) loginWithPin(v);
              }}
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy || pin.length < 4}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <button
            type="button"
            className="muted text-sm underline"
            onClick={() => {
              setMode("link");
              setError(null);
            }}
          >
            ¿Primera vez u olvidaste tu PIN? Entrar con enlace al correo
          </button>
        </form>
      )}

      {mode === "link" && (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          {emailInput}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Enviando…" : "Enviarme el enlace"}
          </button>
          <p className="muted text-xs">Ábrelo en este mismo navegador. Después crea tu PIN en Ajustes.</p>
          <button type="button" className="muted text-sm underline" onClick={() => setMode("pin")}>
            Volver a entrar con PIN
          </button>
        </form>
      )}

      {mode === "sent" && (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm">
            Te enviamos un correo a <b>{email}</b>. Ábrelo <b>en este mismo navegador</b> y toca <b>Sign in</b>. Si el
            correo trae un código, escríbelo aquí.
          </p>
          <input
            className="input text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="código"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn btn-primary" disabled={busy || code.length < 6}>
            {busy ? "Verificando…" : "Entrar con el código"}
          </button>
          <button type="button" className="muted text-sm underline" onClick={() => setMode("pin")}>
            Volver a entrar con PIN
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
