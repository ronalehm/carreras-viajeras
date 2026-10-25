import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { getTripItinerary, ItineraryItemForm, ItineraryTable, TripUpdateForm, TripUpdateList } from "@/modules/bookings";
import { getTripById } from "@/modules/trips";

export const metadata: Metadata = { title: "Itinerario y avisos" };

export default async function TripItineraryPage({ params }: PageProps<"/crm/viajes/[id]/itinerario">) {
  const access = await getCrmAccess("bookings.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Itinerario y avisos</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  // Both return empty for a non-UUID id without querying.
  const [trip, { items, updates }] = await Promise.all([getTripById(id), getTripItinerary(id)]);
  if (!trip) notFound();

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Itinerario y avisos</h1>
        <p className="text-muted-foreground">{trip.title}</p>
      </div>
      <section aria-labelledby="trip-items" className="flex flex-col gap-4">
        <h2 id="trip-items" className="text-lg font-semibold">Hitos del viaje (todos los participantes)</h2>
        <ItineraryTable items={items} editable />
        <ItineraryItemForm owner={{ tripId: trip.id }} />
      </section>
      <section aria-labelledby="trip-updates" className="flex flex-col gap-4">
        <h2 id="trip-updates" className="text-lg font-semibold">Avisos</h2>
        <TripUpdateForm tripId={trip.id} />
        <TripUpdateList updates={updates} />
      </section>
    </section>
  );
}
