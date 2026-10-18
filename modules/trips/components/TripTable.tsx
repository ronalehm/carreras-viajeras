import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { changeTripStatusAction } from "../actions/trips.actions";
import type { Trip, TripStatus } from "../types/trips.types";
import { formatTripDate, formatTripPrice } from "../utils/tripDisplay";

const STATUS_BADGES: Record<TripStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  published: { label: "Publicado", variant: "default" },
  draft: { label: "Borrador", variant: "secondary" },
  archived: { label: "Archivado", variant: "outline" },
};

type TripTableProps = {
  trips: Trip[];
};

export function TripTable({ trips }: TripTableProps) {
  if (trips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay viajes. Crea el primero con «Nuevo viaje».
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Viaje</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead>Carrera</TableHead>
          <TableHead>Precio</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trips.map((trip) => {
          const badge = STATUS_BADGES[trip.status];
          return (
            <TableRow key={trip.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span>{trip.title}</span>
                  <span className="text-muted-foreground">{trip.slug}</span>
                </div>
              </TableCell>
              <TableCell>{`${trip.city}, ${trip.country}`}</TableCell>
              <TableCell>{formatTripDate(trip.raceDate)}</TableCell>
              <TableCell>{formatTripPrice(trip.priceUsd)}</TableCell>
              <TableCell>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </TableCell>
              <TableCell>
                {trip.status !== "archived" && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/crm/viajes/${trip.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Editar
                    </Link>
                    {trip.status === "draft" ? (
                      <ConfirmActionButton
                        action={changeTripStatusAction}
                        fields={{ id: trip.id, status: "published" }}
                        label="Publicar"
                        title={`¿Publicar «${trip.title}»?`}
                        description="Aparecerá en la web pública con sus datos actuales."
                        confirmLabel="Publicar"
                        variant="outline"
                      />
                    ) : (
                      <ConfirmActionButton
                        action={changeTripStatusAction}
                        fields={{ id: trip.id, status: "draft" }}
                        label="Despublicar"
                        title={`¿Despublicar «${trip.title}»?`}
                        description="Dejará de aparecer en la web pública. Podrás volver a publicarlo."
                        confirmLabel="Despublicar"
                        variant="outline"
                      />
                    )}
                    <ConfirmActionButton
                      action={changeTripStatusAction}
                      fields={{ id: trip.id, status: "archived" }}
                      label="Archivar"
                      title={`¿Archivar «${trip.title}»?`}
                      description="Dejará de aparecer en la web y no se podrá editar ni volver a publicar."
                      confirmLabel="Archivar"
                      variant="destructive"
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
