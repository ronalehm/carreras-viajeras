import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { getCrmAccess } from "@/modules/accounts";
import { BookingForm } from "@/modules/bookings";
import { getLeadById } from "@/modules/crm";
import { listTrips, tripScopeFor } from "@/modules/trips";

export const metadata: Metadata = { title: "Nueva reserva" };

export default async function NewBookingPage({ searchParams }: PageProps<"/crm/reservas/nueva">) {
  const access = await getCrmAccess("bookings.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Nueva reserva</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  // ?lead=<id> ("Crear reserva" in the lead's page). getLeadById ignores a non-UUID id; a lead
  // the user cannot read, a missing or archived one, or a repeated parameter → unlinked booking.
  const { lead: leadParam } = await searchParams;
  const leadRequested = leadParam !== undefined && leadParam !== "";
  const [trips, lead] = await Promise.all([
    // bookings.manage implies trips.manage_all, so this scope is always "all".
    listTrips(tripScopeFor(access.user)),
    typeof leadParam === "string" && leadRequested && can(access.user.staffRoles, "leads.manage")
      ? getLeadById(leadParam)
      : null,
  ]);
  // Archived trips take no new bookings (the service enforces it too).
  const tripOptions = trips
    .filter((trip) => trip.status !== "archived")
    .map(({ id, title }) => ({ id, title }));
  const linkable = lead && !lead.archivedAt ? lead : null;
  // The lead's trip is preselected only while it still takes bookings.
  const tripId = tripOptions.find((trip) => trip.id === linkable?.trip?.id)?.id ?? null;
  const prefill = linkable
    ? {
        leadId: linkable.id,
        leadName: linkable.fullName,
        participantName: linkable.fullName,
        participantEmail: linkable.email,
        tripId,
      }
    : undefined;
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nueva reserva</h1>
      {leadRequested && !prefill && (
        <p role="status" className="text-sm text-muted-foreground">
          No se encontró el lead indicado: la reserva se creará sin vincular.
        </p>
      )}
      {/* key: a different ?lead= mounts a fresh form, so its initial values apply. */}
      <BookingForm key={prefill?.leadId ?? ""} tripOptions={tripOptions} prefill={prefill} />
    </section>
  );
}
