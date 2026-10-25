import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteItineraryItemAction } from "../actions/itinerary.actions";
import type { CrmItineraryItem } from "../types/bookings.types";
import {
  formatScheduleEdge,
  ITINERARY_KIND_LABELS,
  ITINERARY_STATUS_BADGE,
  ITINERARY_STATUS_LABELS,
} from "../utils/bookingDisplay";

const COLUMNS = ["Tipo", "Título", "Estado", "Inicio", "Fin", "Visible"];

function schedule(date: string | null, time: string | null, timeZone: string | null) {
  return date ? formatScheduleEdge({ date, time, timeZone }) : "—";
}

// editable is false for a cancelled booking's items: no "Editar" or "Eliminar".
export function ItineraryTable({ items, editable }: { items: CrmItineraryItem[]; editable: boolean }) {
  if (items.length === 0) return <p className="text-muted-foreground">Aún no hay hitos.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => <TableHead key={title}>{title}</TableHead>)}
          {editable && <TableHead>Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const badge = ITINERARY_STATUS_BADGE[item.status];
          return (
            <TableRow key={item.id}>
              <TableCell>{ITINERARY_KIND_LABELS[item.kind]}</TableCell>
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell>
                <Badge variant={badge.variant} className={badge.className}>{ITINERARY_STATUS_LABELS[item.status]}</Badge>
              </TableCell>
              <TableCell>{schedule(item.startDate, item.startTime, item.startTimeZone)}</TableCell>
              <TableCell>{schedule(item.endDate, item.endTime, item.endTimeZone)}</TableCell>
              <TableCell>{item.runnerVisible ? "Sí" : "No"}</TableCell>
              {editable && (
                <TableCell>
                  <div className="flex gap-2">
                    <Link href={`/crm/itinerario/${item.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Editar
                    </Link>
                    <ConfirmActionButton
                      action={deleteItineraryItemAction} fields={{ itemId: item.id }}
                      label="Eliminar" title={`¿Eliminar «${item.title}»?`} confirmLabel="Eliminar hito"
                      variant="destructive" description="Dejará de verse en el itinerario. No se puede deshacer."
                    />
                  </div>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
