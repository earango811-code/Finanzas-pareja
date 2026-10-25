"use client";

// Entrada por correo. Funciona de dos formas:
// - Enlace del correo → /auth/callback (la plantilla por defecto de Supabase solo trae enlace).
//   Ojo: el enlace debe abrirse en el mismo navegador donde se pidió.
// - Código de 6 dígitos, si la plantilla incluye {{ .Token }} (requiere SMTP propio en Supabase).
//   Es lo mejor para la app instalada en iPhone, donde el enlace abre Safari.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkFailed ? "El enlace no sirvió (venció o se abrió en otro navegador). Pide uno nuevo y ábrelo en este mismo navegador." : null,
  );

  async function sendCode(e: React.FormEvent) {
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
    } else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError("Código inválido o vencido. Pide uno nuevo.");
    else {
      router.replace("/pendientes");
      router.refresh();
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">Finanzas en pareja</h1>
        <p className="muted mt-1">Entra con tu correo. Te enviamos un enlace para iniciar sesión.</p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tucorreo@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Enviando…" : "Enviarme el enlace"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm">
            Te enviamos un correo a <b>{email}</b>. Ábrelo <b>en este mismo navegador</b> y toca <b>Sign in</b>. Si
            el correo trae un código de 6 dígitos, escríbelo aquí.
          </p>
          <input
            className="input text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button className="btn btn-primary" disabled={busy || code.length < 6}>
            {busy ? "Verificando…" : "Entrar"}
          </button>
          <button type="button" className="text-sm underline muted" onClick={() => setStep("email")}>
            Cambiar correo
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
