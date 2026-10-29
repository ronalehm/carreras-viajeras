import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import { BOOKING_STATUS_LABELS, getLeadBooking } from "@/modules/bookings";
import {
  ActivityForm,
  archiveLeadAction,
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
  optOutLeadAction,
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
  const canManageBookings = can(access.user.staffRoles, "bookings.manage");
  const [lead, { ownerOptions }, activities, booking] = await Promise.all([
    getLeadById(id),
    getLeadFormOptions(),
    listLeadActivities(id),
    canManageBookings ? getLeadBooking(id) : null,
  ]);
  if (!lead) notFound();

  // At most one active booking per lead: link to it, or offer to create it (not for archived leads).
  const bookingLink = booking ? (
    <Link href={`/crm/reservas/${booking.id}`} className={buttonVariants({ variant: "outline" })}>
      Ver reserva ({BOOKING_STATUS_LABELS[booking.status]})
    </Link>
  ) : canManageBookings && !lead.archivedAt ? (
    <Link href={`/crm/reservas/nueva?lead=${lead.id}`} className={buttonVariants({ variant: "outline" })}>
      Crear reserva
    </Link>
  ) : null;

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">{lead.fullName}</h1>
      <Badge variant={LEAD_STAGE_BADGE_VARIANTS[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</Badge>
    </div>
  );
  const backLink = (
    <div>
      <Link href="/crm/leads" className={buttonVariants({ variant: "ghost" })}>Volver a leads</Link>
    </div>
  );

  // Archived leads are read-only: data and history, no edit link and no forms.
  if (lead.archivedAt) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {header}
          {bookingLink}
        </div>
        <p className="text-muted-foreground">Lead archivado: solo lectura.</p>
        <LeadDetails lead={lead} />
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Seguimiento</h2>
          <LeadTimeline activities={activities} leadSource={lead.source} />
        </section>
        {backLink}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          {bookingLink}
          <Link href={`/crm/leads/${lead.id}/editar`} className={buttonVariants({ variant: "outline" })}>
            Editar datos
          </Link>
          <ConfirmActionButton
            action={archiveLeadAction}
            fields={{ leadId: lead.id }}
            label="Archivar"
            title={`¿Archivar a «${lead.fullName}»?`}
            description="Dejará de aparecer en la lista y no se podrá editar."
            confirmLabel="Archivar"
            variant="destructive"
          />
          {!lead.contactOptOutAt && (
            <ConfirmActionButton
              action={optOutLeadAction}
              fields={{ leadId: lead.id }}
              label="Pidió no seguir"
              title={`¿Registrar que «${lead.fullName}» pidió no seguir en contacto?`}
              description="El lead pasará a Perdido, se quitará la próxima acción y n8n no preparará más borradores. No se puede deshacer desde el CRM."
              confirmLabel="Pidió no seguir"
              variant="destructive"
            />
          )}
        </div>
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
        {lead.contactOptOutAt ? (
          <p className="text-muted-foreground">
            Pidió no seguir en contacto el {formatDateTime(lead.contactOptOutAt)}. No se programan próximas acciones ni
            se preparan borradores.
          </p>
        ) : CLOSED_LEAD_STAGES.includes(lead.stage) ? (
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
        <LeadTimeline activities={activities} leadSource={lead.source} />
      </section>
      {backLink}
    </section>
  );
}
