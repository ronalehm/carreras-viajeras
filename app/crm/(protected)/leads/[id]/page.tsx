import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import {
  ActivityForm,
  CLOSED_LEAD_STAGES,
  getLeadById,
  getLeadFormOptions,
  LEAD_STAGE_BADGE_VARIANTS,
  LEAD_STAGE_LABELS,
  LeadDetails,
  LeadOwnerForm,
  LeadStageForm,
  LeadTimeline,
  listLeadActivities,
  NextActionForm,
} from "@/modules/crm";

export const metadata: Metadata = { title: "Ficha del lead" };

export default async function LeadDetailPage({ params }: PageProps<"/crm/leads/[id]">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Ficha del lead</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  const [lead, { ownerOptions }, activities] = await Promise.all([
    getLeadById(id),
    getLeadFormOptions(),
    listLeadActivities(id),
  ]);
  if (!lead) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{lead.fullName}</h1>
          <Badge variant={LEAD_STAGE_BADGE_VARIANTS[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</Badge>
        </div>
        <Link href={`/crm/leads/${lead.id}/editar`} className={buttonVariants({ variant: "outline" })}>
          Editar datos
        </Link>
      </div>
      <LeadDetails lead={lead} />
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Etapa</h2>
          <LeadStageForm key={lead.stage} leadId={lead.id} stage={lead.stage} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Responsable</h2>
          <LeadOwnerForm leadId={lead.id} ownerUserId={lead.owner?.userId ?? null} ownerOptions={ownerOptions} />
        </section>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Próxima acción</h2>
        {CLOSED_LEAD_STAGES.includes(lead.stage) ? (
          <p className="text-muted-foreground">Lead cerrado: no tiene próxima acción.</p>
        ) : (
          <NextActionForm
            leadId={lead.id}
            nextActionDate={lead.nextActionDate}
            nextActionNote={lead.nextActionNote}
            today={getTodayDate()}
          />
        )}
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Seguimiento</h2>
        <ActivityForm leadId={lead.id} />
        <LeadTimeline activities={activities} />
      </section>
      <div>
        <Link href="/crm/leads" className={buttonVariants({ variant: "ghost" })}>Volver a leads</Link>
      </div>
    </section>
  );
}
