import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { getTripById, TripForm, tripScopeFor } from "@/modules/trips";

export const metadata: Metadata = { title: "Editar carrera" };

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCrmAccess("trips.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Editar carrera</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar carreras. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  // Another organizer's trip reads as missing (null), so it is a 404 too.
  const trip = await getTripById(id, tripScopeFor(access.user));
  if (!trip) notFound();
  if (trip.status === "archived") {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold">Carrera archivada</h1>
        <p className="text-muted-foreground">Esta carrera está archivada y no se puede editar.</p>
        <Link href="/crm/viajes" className={buttonVariants({ variant: "outline" })}>Volver a carreras</Link>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Editar carrera</h1>
      <TripForm trip={trip} />
    </section>
  );
}
