import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { BookingFilters, BookingTable, listBookings } from "@/modules/bookings";
import { listTrips, tripScopeFor } from "@/modules/trips";

export const metadata: Metadata = { title: "Reservas" };

// A malformed or repeated ?viaje is ignored: the list shows every booking.
const tripFilterSchema = z.uuid().optional().catch(undefined);

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
  const tripId = tripFilterSchema.parse((await searchParams).viaje);
  const [bookings, trips] = await Promise.all([listBookings(tripId), listTrips(tripScopeFor(access.user))]);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Reservas</h1>
        <Link href="/crm/reservas/nueva" className={buttonVariants()}>Nueva reserva</Link>
      </div>
      <BookingFilters trips={trips.map(({ id, title }) => ({ id, title }))} tripId={tripId} />
      <BookingTable bookings={bookings} filtered={tripId !== undefined} />
    </section>
  );
}
