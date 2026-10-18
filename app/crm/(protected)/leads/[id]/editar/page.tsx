import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { getLeadById, getLeadFormOptions, LeadForm } from "@/modules/crm";

export const metadata: Metadata = { title: "Editar lead" };

export default async function EditLeadPage({ params }: PageProps<"/crm/leads/[id]/editar">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Editar lead</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  const [lead, { tripOptions }] = await Promise.all([getLeadById(id), getLeadFormOptions()]);
  if (!lead) notFound();
  // Only the editable fields reach the client component.
  const { fullName, phone, email, location, trip, destinationText } = lead;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Editar lead</h1>
      {lead.archivedAt ? (
        <>
          <p className="text-muted-foreground">Lead archivado: solo lectura.</p>
          <div>
            <Link href={`/crm/leads/${lead.id}`} className={buttonVariants({ variant: "ghost" })}>
              Volver a la ficha
            </Link>
          </div>
        </>
      ) : (
        <LeadForm
          lead={{ id: lead.id, fullName, phone, email, location, trip, destinationText }}
          tripOptions={tripOptions}
        />
      )}
    </section>
  );
}
