import { headers } from "next/headers";
import { GmailConnect } from "@/components/gmail-connect";
import { PageHeader } from "@/components/page-header";
import { PinSettings } from "@/components/pin-settings";
import { SignOutButton } from "@/components/settings";
import { currentMonth } from "@/domain/dates";
import { alertsMasterSecret, deriveMemberKey } from "@/lib/hmac";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "PIN y Gmail" };

export default async function AccesoPage() {
  const { supabase, me, members, partner, user } = await getHousehold();
  const monthStart = `${currentMonth()}-01`;
  const logs = await supabase
    .from("ingest_log")
    .select("member_id, status, text, created_at")
    .eq("household_id", me.household_id)
    .gte("created_at", new Date(Date.now() - 45 * 864e5).toISOString())
    .order("created_at", { ascending: false })
    .limit(2000)
    .returns<{ member_id: string; status: string; text: string | null; created_at: string }[]>();

  // Conexión de Gmail: URL del webhook, clave personal (derivada) y estado de cada uno
  const h = await headers();
  const webhookUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/ingest/email`;
  const master = alertsMasterSecret();
  const secret = master && master.length >= 32 && process.env.SUPABASE_SERVICE_ROLE_KEY ? deriveMemberKey(master, me.id) : null;
  const logRows = logs.data ?? [];
  const gmailStatus = members.map((m) => {
    const mine = logRows.filter((l) => l.member_id === m.id);
    return {
      name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name,
      lastAt: mine[0]?.created_at ?? null,
      created: mine.filter((l) => l.status === "creado" && l.created_at >= monthStart).length,
      unknown: mine.filter((l) => l.status === "formato_desconocido").length,
    };
  });
  const unknownSamples = logRows
    .filter((l) => l.status === "formato_desconocido" && l.text)
    .slice(0, 10)
    .map((l) => ({ at: l.created_at, text: l.text! }));

  return (
    <>
      <PageHeader title="PIN y Gmail" backHref="/mas" />
      <div className="flex flex-col gap-6 px-4 pb-8">
        <section id="pin">
          <h2 className="mb-1 font-semibold">Acceso con PIN</h2>
          <p className="muted mb-3 text-xs">
            Entran con su correo + un PIN de 4 números. Tras 5 intentos fallidos se bloquea 15 minutos (y cada bloqueo dura
            el doble). La sesión queda abierta en cada dispositivo.
          </p>
          <PinSettings
            myPinSet={!!me.pin_set_at}
            partner={
              partner
                ? { name: partner.display_name, email: partner.email, linked: !!partner.user_id, pinSet: !!partner.pin_set_at }
                : null
            }
          />
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Alertas del banco por correo</h2>
          <p className="muted mb-3 text-xs">
            Cada uno conecta su Gmail una vez. La app solo recibe las alertas de Bancolombia; nunca pide claves del banco.
          </p>
          <GmailConnect webhookUrl={webhookUrl} memberId={me.id} secret={secret} status={gmailStatus} unknownSamples={unknownSamples} />
        </section>

        <section className="flex flex-col items-center gap-2">
          <p className="muted text-xs">Sesión: {user.email}</p>
          <SignOutButton />
        </section>
      </div>
    </>
  );
}
