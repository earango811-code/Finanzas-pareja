// Contexto del hogar para páginas y acciones del servidor.
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AccountRow, CategoryRow, HouseholdRow, MemberRow } from "@/lib/db-types";
import { materializeRecurring } from "@/lib/recurring-runner";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  let { data: me } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", data.user.id)
    .maybeSingle<MemberRow>();

  if (!me) {
    // ¿Su pareja ya lo invitó? Lo vinculamos por correo.
    const { data: claimed } = await supabase.rpc("claim_membership");
    if (claimed) {
      ({ data: me } = await supabase.from("members").select("*").eq("id", claimed).single<MemberRow>());
    }
  }
  return { supabase, user: data.user, me };
});

/** Exige que el usuario pertenezca a un hogar; si no, lo manda a crearlo. */
export const getHousehold = cache(async () => {
  const { supabase, user, me } = await getSession();
  if (!me) redirect("/bienvenida");

  // Antes de leer nada, crear los movimientos de recurrentes que ya vencieron
  // (una vez por request gracias a cache()).
  await materializeRecurring({ supabase, me });

  const [household, members, accounts, categories] = await Promise.all([
    supabase.from("households").select("*").eq("id", me.household_id).single<HouseholdRow>(),
    supabase.from("members").select("*").eq("household_id", me.household_id).order("created_at").returns<MemberRow[]>(),
    supabase.from("accounts").select("*").eq("household_id", me.household_id).order("created_at").returns<AccountRow[]>(),
    supabase.from("categories").select("*").eq("household_id", me.household_id).order("sort_order").returns<CategoryRow[]>(),
  ]);

  const memberList = members.data ?? [];
  return {
    supabase,
    user,
    me,
    household: household.data!,
    members: memberList,
    partner: memberList.find((m) => m.id !== me.id) ?? null,
    accounts: accounts.data ?? [],
    /** Activas: las que se ofrecen al clasificar. */
    categories: (categories.data ?? []).filter((c) => c.is_active),
    /** Todas, incluidas las desactivadas (para etiquetas de movimientos viejos y el editor). */
    allCategories: categories.data ?? [],
  };
});

export type HouseholdContext = Awaited<ReturnType<typeof getHousehold>>;

export function memberName(ctx: Pick<HouseholdContext, "members" | "me">, id: string | null): string {
  if (!id) return "—";
  if (id === ctx.me.id) return "Yo";
  return ctx.members.find((m) => m.id === id)?.display_name ?? "—";
}
