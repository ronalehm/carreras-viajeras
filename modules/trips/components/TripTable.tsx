import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeTripStatusAction } from "../actions/trips.actions";
import type { Trip } from "../types/trips.types";
import { formatTripDate } from "../utils/tripDisplay";

const STATUS_LABELS = { draft: "Borrador", published: "Publicado", archived: "Archivado" };
const STATUS_VARIANTS = { draft: "secondary", published: "default", archived: "outline" } as const;

export function TripTable({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) {
    return <p className="text-muted-foreground">Aún no hay viajes. Crea el primero con «Nuevo viaje».</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {["Viaje", "Destino", "Carrera", "Estado", "Acciones"].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {trips.map((trip) => {
          const published = trip.status === "published";
          const label = published ? "Despublicar" : "Publicar";
          return (
            <TableRow key={trip.id}>
              <TableCell>
                <p className="font-medium">{trip.title}</p>
                <p className="text-sm text-muted-foreground">{trip.slug}</p>
              </TableCell>
              <TableCell>{trip.city}, {trip.country}</TableCell>
              <TableCell>{formatTripDate(trip.raceDate)}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANTS[trip.status]}>{STATUS_LABELS[trip.status]}</Badge></TableCell>
              <TableCell>
                {trip.status !== "archived" && (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/crm/viajes/${trip.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Editar
                    </Link>
                    <ConfirmActionButton
                      action={changeTripStatusAction}
                      fields={{ id: trip.id, status: published ? "draft" : "published" }}
                      label={label} title={`¿${label} «${trip.title}»?`} confirmLabel={label} variant="outline"
                      description={published
                        ? "Dejará de aparecer en la web pública. Podrás volver a publicarlo."
                        : "Aparecerá en la web pública con sus datos actuales."}
                    />
                    <ConfirmActionButton
                      action={changeTripStatusAction} fields={{ id: trip.id, status: "archived" }}
                      label="Archivar" title={`¿Archivar «${trip.title}»?`} confirmLabel="Archivar" variant="destructive"
                      description="Dejará de aparecer en la web y no se podrá editar ni volver a publicar."
                    />
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
