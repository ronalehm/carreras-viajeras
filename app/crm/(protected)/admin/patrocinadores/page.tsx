import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { listSponsors, SponsorTable } from "@/modules/sponsors";

export const metadata: Metadata = { title: "Patrocinadores" };

export default async function SponsorsPage() {
  // The layout does not re-render on client navigation, so the page checks sponsors.manage itself.
  const access = await getCrmAccess("sponsors.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Patrocinadores</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar patrocinadores. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const sponsors = await listSponsors();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Patrocinadores</h1>
        <Link href="/crm/admin/patrocinadores/nuevo" className={buttonVariants()}>Nuevo patrocinador</Link>
      </div>
      <SponsorTable sponsors={sponsors} />
    </section>
  );
}
