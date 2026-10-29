import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { SponsorForm } from "@/modules/sponsors";

export const metadata: Metadata = { title: "Nuevo patrocinador" };

export default async function NewSponsorPage() {
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
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nuevo patrocinador</h1>
      <SponsorForm />
    </section>
  );
}
