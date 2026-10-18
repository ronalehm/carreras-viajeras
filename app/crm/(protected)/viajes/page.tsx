import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import { listTrips, TripTable } from "@/modules/trips";

export const metadata: Metadata = { title: "Viajes" };

export default async function TripsPage() {
  const access = await getCrmAccess("trips.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Viajes</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar viajes. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const trips = await listTrips();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Viajes</h1>
        <Link href="/crm/viajes/nuevo" className={buttonVariants()}>Nuevo viaje</Link>
      </div>
      <TripTable trips={trips} />
    </section>
  );
}
