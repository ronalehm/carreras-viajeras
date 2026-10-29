import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { getCrmAccess } from "@/modules/accounts";
import { RewardProgramAdmin } from "@/modules/rewards";

export const metadata: Metadata = { title: "Recompensas" };

export default async function RewardsAdminPage() {
  const access = await getCrmAccess("rewards.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Recompensas</h1><p>No tienes permiso para configurar recompensas.</p></section>;
  return <section className="grid gap-7"><CrmPageHeader title="Reglas y recompensas" section="Administración" description="Configura referidos, condiciones y versiones del catálogo." /><RewardProgramAdmin /></section>;
}
