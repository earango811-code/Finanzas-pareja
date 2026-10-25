import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/household";
import { Logo } from "@/components/logo";
import { MoneyInput } from "@/components/money-input";

const schema = z.object({
  household_name: z.string().trim().max(60),
  my_name: z.string().trim().min(1, "Tu nombre"),
  my_income: z.coerce.number().int().min(0),
  partner_name: z.string().trim().min(1, "Nombre de tu pareja"),
  partner_email: z.string().trim().email("Correo de tu pareja inválido"),
  partner_income: z.coerce.number().int().min(0),
  partner_deductions: z.coerce.number().int().min(0).default(0),
});

async function createHousehold(formData: FormData) {
  "use server";
  const { supabase } = await getSession();
  const p = schema.parse(Object.fromEntries(formData));
  const { error } = await supabase.rpc("create_household", p);
  if (error) throw new Error(error.message);
  redirect("/pendientes");
}

export default async function WelcomePage() {
  const { me, user } = await getSession();
  if (me) redirect("/pendientes");

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <Logo size={56} className="mb-4 rounded-2xl shadow-md" />
      <h1 className="text-2xl font-bold">Bienvenido 👋</h1>
      <p className="muted mt-1 text-sm">
        Entraste como <b>{user.email}</b>. Si tu pareja ya creó el hogar con este correo, pídele que revise el
        correo que puso. Si no, créalo aquí: cargamos las categorías y montos de su Excel (todo editable).
      </p>

      <form action={createHousehold} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Nombre del hogar
          <input name="household_name" className="input" placeholder="Nuestro hogar" />
        </label>

        <fieldset className="card flex flex-col gap-3 p-4">
          <legend className="px-1 text-sm font-semibold">Tú</legend>
          <input name="my_name" className="input" placeholder="Tu nombre" required />
          <MoneyInput name="my_income" placeholder="Ingreso mensual" required />
        </fieldset>

        <fieldset className="card flex flex-col gap-3 p-4">
          <legend className="px-1 text-sm font-semibold">Tu pareja</legend>
          <input name="partner_name" className="input" placeholder="Su nombre" required />
          <input name="partner_email" type="email" className="input" placeholder="Su correo (con el que entrará)" required />
          <MoneyInput name="partner_income" placeholder="Ingreso mensual" required />
          <MoneyInput name="partner_deductions" placeholder="Descuentos fijos (ej. cuota de estudio) — opcional" />
        </fieldset>

        <p className="muted text-xs">
          El % de reparto se calcula con (ingreso − descuentos). Lo pueden cambiar cuando quieran en Ajustes.
        </p>
        <button className="btn btn-primary">Crear hogar</button>
      </form>
    </main>
  );
}
