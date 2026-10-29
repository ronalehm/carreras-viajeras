import { cn } from "@/lib/utils";
import type { RunnerTripUpdate } from "../types/bookings.types";
import { formatShortDate, limaDate } from "../utils/bookingDisplay";

function TripUpdate({ update }: { update: RunnerTripUpdate }) {
  const day = limaDate(update.publishedAt);
  return (
    <article className="space-y-1 text-sm">
      <h3 className="font-bold">
        {update.title} · <time dateTime={day} className="font-normal">{formatShortDate(day)}</time>
      </h3>
      <p className="break-words whitespace-pre-line">{update.body}</p>
    </article>
  );
}

/** Updates arrive most recent first: the latest is shown in full, the rest collapsed. */
export function TripUpdates({ updates, className }: { updates: RunnerTripUpdate[]; className?: string }) {
  const [latest, ...older] = updates;
  return (
    <section aria-labelledby="trip-updates-title" className={cn("text-primary", className)}>
      <h2 id="trip-updates-title" className="mb-4 text-xs font-bold tracking-[0.2em] uppercase">
        Avisos del viaje
      </h2>
      {!latest ? (
        <p className="text-sm">Sin avisos por ahora.</p>
      ) : (
        <>
          <div className="border-l-4 border-highlight pl-3">
            <TripUpdate update={latest} />
          </div>
          {older.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-bold">Avisos anteriores ({older.length})</summary>
              <div className="mt-3 space-y-4 border-l border-primary/25 pl-3">
                {older.map((update) => (
                  <TripUpdate key={update.id} update={update} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
