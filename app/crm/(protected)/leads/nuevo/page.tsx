import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { getLeadFormOptions, LeadForm } from "@/modules/crm";

export const metadata: Metadata = { title: "Nuevo lead" };

export default async function NewLeadPage() {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Nuevo lead</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { ownerOptions, tripOptions } = await getLeadFormOptions();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nuevo lead</h1>
      <LeadForm ownerOptions={ownerOptions} tripOptions={tripOptions} defaultOwnerId={access.user.id} />
    </section>
  );
}
