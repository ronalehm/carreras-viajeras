import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { TripForm } from "@/modules/trips";

export const metadata: Metadata = {
  title: "Nuevo viaje",
};

export default async function NewTripPage() {
  const access = await getCrmAccess("trips.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");

  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Nuevo viaje</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar viajes. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nuevo viaje</h1>
      <TripForm />
    </section>
  );
}
