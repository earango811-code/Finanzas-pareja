import { PageHeader } from "@/components/page-header";
import { AccountsEditor } from "@/components/settings";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Cuentas y tarjetas" };

export default async function CuentasPage() {
  const { me, members, accounts } = await getHousehold();
  const memberOpts = members.map((m) => ({ id: m.id, name: m.id === me.id ? `${m.display_name} (yo)` : m.display_name }));
  return (
    <>
      <PageHeader title="Cuentas y tarjetas" backHref="/mas" />
      <div className="px-4 pb-8">
        <AccountsEditor accounts={accounts} members={memberOpts} />
      </div>
    </>
  );
}
