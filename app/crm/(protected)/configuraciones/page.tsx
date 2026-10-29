import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmSettings, getCrmAccess } from "@/modules/accounts";

export const metadata: Metadata = { title: "Configuraciones del CRM" };

export default async function CrmSettingsPage() {
  const access = await getCrmAccess("staff.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Configuraciones</h1>
        <p className="text-sm text-muted-foreground">
          No tienes permiso para administrar la configuración del equipo.
        </p>
      </section>
    );
  }
  return (
    <CrmSettings email={access.user.email} roles={access.user.staffRoles} />
  );
}
