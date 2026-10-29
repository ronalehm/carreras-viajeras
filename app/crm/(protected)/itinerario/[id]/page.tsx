import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { getItineraryItemById, ItineraryItemForm, ItineraryTable, itineraryOriginPath } from "@/modules/bookings";

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
  if (!item.editable) {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold">Hito</h1>
        <p className="text-muted-foreground">Reserva cancelada: solo lectura.</p>
        <ItineraryTable items={[item]} editable={false} />
        <Link href={itineraryOriginPath(item)} className={buttonVariants({ variant: "outline" })}>Volver</Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Editar hito</h1>
      {/* "Volver" (to the trip itinerary or the booking) is part of the form. */}
      <ItineraryItemForm item={item} />
    </section>
  );
}
