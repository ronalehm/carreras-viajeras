import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { BOOKING_KIND_SIMULATED, BookingFilters, BookingTable, listBookings } from "@/modules/bookings";
import { listTrips, tripScopeFor } from "@/modules/trips";

export const metadata: Metadata = { title: "Reservas" };

// A malformed or repeated ?viaje is ignored: the list shows every booking.
const tripFilterSchema = z.uuid().optional().catch(undefined);
// Only ?tipo=simuladas lists the simulated (demo) bookings; anything else lists the real ones.
const simulatedFilterSchema = z.literal(BOOKING_KIND_SIMULATED).optional().catch(undefined);

export default async function BookingsPage({ searchParams }: PageProps<"/crm/reservas">) {
  const access = await getCrmAccess("bookings.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Reservas</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const params = await searchParams;
  const tripId = tripFilterSchema.parse(params.viaje);
  const simulated = simulatedFilterSchema.parse(params.tipo) !== undefined;
  // bookings.manage implies trips.manage_all, so this scope is always "all".
  const [bookings, trips] = await Promise.all([
    listBookings({ tripId, simulated }),
    listTrips(tripScopeFor(access.user)),
  ]);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Reservas</h1>
        <Link href="/crm/reservas/nueva" className={buttonVariants()}>Nueva reserva</Link>
      </div>
      <BookingFilters trips={trips.map(({ id, title }) => ({ id, title }))} tripId={tripId} simulated={simulated} />
      {simulated && (
        <p className="text-sm text-muted-foreground">
          Reservas simuladas del checkout de demostración (Stripe en modo de prueba): sin cargo real. No cuentan en
          totales ni informes comerciales.
        </p>
      )}
      <BookingTable bookings={bookings} filtered={tripId !== undefined || simulated} />
    </section>
  );
}
