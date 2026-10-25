// Entrada con correo + PIN. Todo intento pasa por aquí para aplicar el bloqueo:
// el PIN se convierte en la contraseña real con un secreto que solo tiene el servidor.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { afterFailure, lockRemainingMinutes, normalizeEmail, PIN_REGEX, pinToPassword, type AttemptState } from "@/lib/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email().max(320), pin: z.string().regex(PIN_REGEX) });
const WRONG = "Correo o PIN incorrectos";

export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_HMAC_SECRET;
  if (!secret) return NextResponse.json({ error: "Servidor sin configurar" }, { status: 500 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: WRONG }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);

  const admin = createAdminClient();
  const { data: state } = await admin
    .from("login_attempts")
    .select("failures, lockouts, locked_until")
    .eq("email", email)
    .maybeSingle<AttemptState>();

  const locked = lockRemainingMinutes(state);
  if (locked > 0) {
    return NextResponse.json({ error: `Demasiados intentos. Intenta de nuevo en ${locked} min.` }, { status: 429 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pinToPassword(secret, email, parsed.data.pin) });

  if (error) {
    const next = afterFailure(state);
    await admin.from("login_attempts").upsert({ email, ...next, updated_at: new Date().toISOString() });
    // Pequeña pausa para frenar intentos automáticos
    await new Promise((r) => setTimeout(r, 600));
    const nowLocked = lockRemainingMinutes(next);
    return NextResponse.json(
      { error: nowLocked ? `Demasiados intentos. Intenta de nuevo en ${nowLocked} min.` : WRONG },
      { status: nowLocked ? 429 : 401 },
    );
  }

  if (state) await admin.from("login_attempts").delete().eq("email", email);
  return NextResponse.json({ ok: true });
}
