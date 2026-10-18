import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { getTripById, TripForm } from "@/modules/trips";

export const metadata: Metadata = {
  title: "Editar viaje",
};

export default async function EditTripPage({ params }: PageProps<"/crm/viajes/[id]">) {
  const access = await getCrmAccess("trips.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");

  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Editar viaje</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar viajes. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }

  // getTripById returns null for unknown ids and for ids that are not UUIDs.
  const { id } = await params;
  const trip = await getTripById(id);
  if (!trip) notFound();

  if (trip.status === "archived") {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold">Viaje archivado</h1>
        <p className="text-muted-foreground">Este viaje está archivado y no se puede editar.</p>
        <Link href="/crm/viajes" className={buttonVariants({ variant: "outline" })}>
          Volver a viajes
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Editar viaje</h1>
      <TripForm trip={trip} />
    </section>
  );
}
