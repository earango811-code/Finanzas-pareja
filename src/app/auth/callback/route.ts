// Recibe el enlace de inicio de sesión del correo (flujo PKCE de Supabase),
// crea la sesión y manda a la app.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  // Solo rutas internas, para no convertir esto en un redireccionador abierto
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
  }
  const fail = new URL("/login", url.origin);
  fail.searchParams.set("error", "enlace");
  return NextResponse.redirect(fail);
}
