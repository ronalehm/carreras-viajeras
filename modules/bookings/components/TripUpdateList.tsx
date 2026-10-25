import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { deleteTripUpdateAction } from "../actions/itinerary.actions";
import type { CrmTripUpdate } from "../types/bookings.types";
import { formatShortDate, limaDate } from "../utils/bookingDisplay";

// Newest first (the service orders them). Published announcements are deleted, never edited.
export function TripUpdateList({ updates }: { updates: CrmTripUpdate[] }) {
  if (updates.length === 0) return <p className="text-muted-foreground">Aún no hay avisos.</p>;
  return (
    <ul className="flex max-w-3xl flex-col gap-4">
      {updates.map((update) => (
        <li key={update.id} className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{update.title}</h3>
              <p className="text-sm text-muted-foreground">{formatShortDate(limaDate(update.publishedAt))}</p>
            </div>
            <ConfirmActionButton
              action={deleteTripUpdateAction} fields={{ updateId: update.id }}
              label="Eliminar" title={`¿Eliminar el aviso «${update.title}»?`} confirmLabel="Eliminar aviso"
              variant="destructive" description="Los participantes dejarán de verlo. No se puede deshacer."
            />
          </div>
          <p className="whitespace-pre-line">{update.body}</p>
        </li>
      ))}
    </ul>
  );
}
