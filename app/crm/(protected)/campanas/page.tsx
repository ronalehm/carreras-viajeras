import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { CampaignForm, CampaignTable, getLeadFormOptions, listCampaigns } from "@/modules/crm";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage() {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Campañas</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar campañas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const [campaigns, { tripOptions }] = await Promise.all([listCampaigns(), getLeadFormOptions()]);
  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Campañas</h1>
      <CampaignForm tripOptions={tripOptions} />
      <CampaignTable campaigns={campaigns} />
    </section>
  );
}
