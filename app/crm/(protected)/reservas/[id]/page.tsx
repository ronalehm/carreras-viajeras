import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { BookingRewardsPanel } from "@/modules/rewards";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { getCrmAccess } from "@/modules/accounts";
import { BookingForm, BookingStatusBadge, changeBookingStatusAction, getBookingById, listBookingPayments, PaymentForm, PaymentTable } from "@/modules/bookings";
import { formatTripPrice } from "@/modules/trips";

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
  const booking = await getBookingById(id);
  if (!booking) notFound();
  const cancelled = booking.status === "cancelled";
  const payments = await listBookingPayments(id);

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
            {booking.status === "pending" && (
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
      {cancelled ? (
        <>
          <p className="text-muted-foreground">Reserva cancelada: solo lectura.</p>
          <dl className="grid max-w-3xl gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            {[
              ["Correo", booking.participantEmail],
              ["Paquete", booking.distance ? `${booking.packageLabel} · ${booking.distance}` : booking.packageLabel],
              ["Total acordado", formatTripPrice(booking.totalUsd)],
              ["Pagado", formatTripPrice(booking.paidUsd)],
              ["Fecha límite del saldo", booking.balanceDueOn ?? "—"],
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
        <BookingForm booking={booking} priceLocked={booking.priceLocked} />
      )}
      <section className="grid gap-4" aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-semibold">Pagos</h2>
        <PaymentTable payments={payments} totalUsd={booking.totalUsd} editable={!cancelled} />
        {!cancelled && <PaymentForm bookingId={booking.id} />}
      </section>
      <BookingRewardsPanel bookingId={booking.id} canManage={can(access.user.staffRoles, "rewards.manage")} />
    </section>
  );
}
