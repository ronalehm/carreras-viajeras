import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { BookingForm } from "@/modules/bookings";
import { listTrips } from "@/modules/trips";

export const metadata: Metadata = { title: "Nueva reserva" };

export default async function NewBookingPage() {
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
  // Archived trips take no new bookings (the service enforces it too).
  const trips = await listTrips();
  const tripOptions = trips
    .filter((trip) => trip.status !== "archived")
    .map(({ id, title }) => ({ id, title }));
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nueva reserva</h1>
      <BookingForm tripOptions={tripOptions} />
    </section>
  );
}
