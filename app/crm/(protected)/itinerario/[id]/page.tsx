import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { getItineraryItemById, ItineraryItemForm } from "@/modules/bookings";

export const metadata: Metadata = { title: "Editar hito" };

export default async function EditItineraryItemPage({ params }: PageProps<"/crm/itinerario/[id]">) {
  const access = await getCrmAccess("bookings.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Editar hito</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  const item = await getItineraryItemById(id);
  if (!item) notFound();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Editar hito</h1>
      {/* "Volver" (to the trip itinerary or the booking) is part of the form. */}
      <ItineraryItemForm item={item} />
    </section>
  );
}
