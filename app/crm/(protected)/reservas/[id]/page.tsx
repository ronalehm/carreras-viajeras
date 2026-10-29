import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { getCrmAccess } from "@/modules/accounts";
import {
  BookingForm,
  BookingStatusBadge,
  changeBookingStatusAction,
  getBookingById,
  ItineraryItemForm,
  ItineraryTable,
  listBookingItems,
  listBookingPayments,
  PaymentForm,
  PaymentTable,
} from "@/modules/bookings";
import { formatTripDate } from "@/modules/trips";

export const metadata: Metadata = { title: "Reserva" };

export default async function BookingPage({ params }: PageProps<"/crm/reservas/[id]">) {
  const access = await getCrmAccess("bookings.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Reserva</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  // The lists return [] for a non-UUID id without querying, so all reads run in parallel.
  const [booking, payments, items] = await Promise.all([
    getBookingById(id), listBookingPayments(id), listBookingItems(id),
  ]);
  if (!booking) notFound();
  const cancelled = booking.status === "cancelled";
  // Decision 22: an archived trip freezes its bookings; they can only be cancelled. Its payments,
  // items and updates are not frozen by this spec, so their forms depend on `cancelled` alone.
  const readOnly = cancelled || booking.trip.archived;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{booking.participantName}</h1>
            <BookingStatusBadge status={booking.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Cuenta: {booking.linked ? "Vinculada" : "Sin vincular"} · {booking.trip.title}
          </p>
          {booking.lead && (
            <p className="text-sm text-muted-foreground">
              Lead:{" "}
              <Link href={`/crm/leads/${booking.lead.id}`} className="text-foreground underline underline-offset-4 hover:text-primary">
                {booking.lead.fullName}
              </Link>
            </p>
          )}
        </div>
        {!cancelled && (
          <div className="flex flex-wrap gap-2">
            {booking.status === "pending" && !booking.trip.archived && (
              <ConfirmActionButton
                action={changeBookingStatusAction} fields={{ bookingId: booking.id, status: "confirmed" }}
                label="Confirmar reserva" title={`¿Confirmar la reserva de ${booking.participantName}?`}
                confirmLabel="Confirmar reserva" variant="outline"
                description="La persona la verá como confirmada en su portal."
              />
            )}
            <ConfirmActionButton
              action={changeBookingStatusAction} fields={{ bookingId: booking.id, status: "cancelled" }}
              label="Cancelar reserva" title={`¿Cancelar la reserva de ${booking.participantName}?`}
              confirmLabel="Cancelar reserva" variant="destructive"
              description="Quedará en solo lectura y no se podrá restaurar."
            />
          </div>
        )}
      </div>
      {readOnly ? (
        <>
          <p className="text-muted-foreground">
            {cancelled ? "Reserva cancelada: solo lectura." : "Viaje archivado: la reserva solo se puede cancelar."}
          </p>
          <dl className="grid max-w-3xl gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            {[
              ["Correo", booking.participantEmail],
              ["Paquete", booking.distance ? `${booking.packageLabel} · ${booking.distance}` : booking.packageLabel],
              ["Fecha límite del saldo", booking.balanceDueOn ? formatTripDate(booking.balanceDueOn) : "—"],
              ["Nota interna", booking.internalNote ?? "—"],
            ].map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-sm text-muted-foreground">{term}</dt>
                <dd className="whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <BookingForm booking={booking} />
      )}
      <section aria-labelledby="booking-payments" className="flex flex-col gap-4">
        <h2 id="booking-payments" className="text-lg font-semibold">Pagos</h2>
        <PaymentTable payments={payments} totalUsd={booking.totalUsd} editable={!cancelled} />
        {!cancelled && <PaymentForm bookingId={booking.id} />}
      </section>
      <section aria-labelledby="booking-items" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="booking-items" className="text-lg font-semibold">Servicios de esta reserva</h2>
          <Link
            href={`/crm/viajes/${booking.trip.id}/itinerario`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Ver itinerario del viaje
          </Link>
        </div>
        <ItineraryTable items={items} editable={!cancelled} />
        {!cancelled && <ItineraryItemForm owner={{ bookingId: booking.id }} />}
      </section>
    </section>
  );
}
