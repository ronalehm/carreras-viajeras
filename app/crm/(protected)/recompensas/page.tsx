import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { getCrmAccess } from "@/modules/accounts";
import { getActiveWelcomeDiscount, listWelcomeDiscountVersions, RewardProgramAdmin } from "@/modules/rewards";

export const metadata: Metadata = { title: "Recompensas" };

const WELCOME_DISCOUNT_HISTORY = 5;

async function loadWelcomeDiscount() {
  try {
    const [active, versions] = await Promise.all([getActiveWelcomeDiscount(), listWelcomeDiscountVersions(WELCOME_DISCOUNT_HISTORY)]);
    return { active, versions };
  } catch {
    // The service already hides driver details; the section shows a fixed message.
    return null;
  }
}

export default async function RewardsAdminPage() {
  const access = await getCrmAccess("rewards.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Recompensas</h1><p>No tienes permiso para configurar recompensas.</p></section>;
  const welcomeDiscount = await loadWelcomeDiscount();
  return <section className="grid gap-7"><CrmPageHeader title="Reglas y recompensas" section="Administración" description="Configura referidos, condiciones, versiones del catálogo y el descuento de bienvenida." /><RewardProgramAdmin welcomeDiscount={welcomeDiscount} /></section>;
}
