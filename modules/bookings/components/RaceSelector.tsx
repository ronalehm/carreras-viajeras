import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RunnerBookingSummary } from "../types/bookings.types";
import { formatShortDate } from "../utils/bookingDisplay";
import { isTripFinished } from "../utils/runnerBookings";

function statusLabel(booking: RunnerBookingSummary, today: string): string | null {
  if (booking.status === "cancelled") return "Cancelada";
  if (isTripFinished(booking.trip, today)) return "Terminado";
  return booking.status === "pending" ? "Pendiente" : null;
}

/** Navigation between the runner's races (`?reserva=<id>`). Bookings arrive already ordered (Requirement 7). */
export function RaceSelector({
  bookings,
  selectedId,
  today,
}: {
  bookings: RunnerBookingSummary[];
  selectedId: string;
  today: string;
}) {
  if (bookings.length < 2) return null;
  return (
    <nav aria-label="Tus carreras" className="max-w-full border-b border-primary/20">
      {/* Only this row scrolls horizontally; the page never does. */}
      <ul className="-mb-px flex snap-x gap-6 overflow-x-auto">
        {bookings.map((booking, index) => {
          const active = booking.id === selectedId;
          const label = statusLabel(booking, today);
          return (
            <li key={booking.id} className="shrink-0 snap-start">
              <Link
                href={`/mis-carreras?reserva=${booking.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-56 gap-2 border-b-3 pt-1 pb-3 text-primary no-underline sm:w-64",
                  active ? "border-highlight" : "border-transparent opacity-75 hover:opacity-100",
                )}
              >
                <span aria-hidden className="display-title text-lg leading-tight text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold leading-tight">{booking.trip.title}</span>
                  <span className="block text-xs">
                    {formatShortDate(booking.trip.raceDate)}
                    {label && <> · {label}</>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
