import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { getSponsorById, SponsorForm } from "@/modules/sponsors";

export const metadata: Metadata = { title: "Patrocinador" };

export default async function EditSponsorPage({ params }: { params: Promise<{ id: string }> }) {
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
  const { id } = await params;
  // A non-UUID id returns null without querying: both cases are a 404.
  const sponsor = await getSponsorById(id);
  if (!sponsor) notFound();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{sponsor.name}</h1>
      <SponsorForm sponsor={sponsor} />
    </section>
  );
}
