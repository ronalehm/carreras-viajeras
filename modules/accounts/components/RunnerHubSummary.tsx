import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/dates";
import { BOOKING_STATUS_LABELS } from "@/modules/bookings";
import type { RunnerHubState } from "../utils/runnerHub";

export function RunnerHubSummary({ state }: { state: RunnerHubState }) {
  return (
    <section id="mis-carreras" aria-labelledby="my-races-title" className="space-y-4 scroll-mt-6">
      <h2 id="my-races-title" className="text-2xl font-semibold">Mis carreras</h2>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>No pudimos cargar tus carreras. Inténtalo de nuevo en unos minutos.</AlertDescription>
          <Link href="/cuenta/perfil#mis-carreras" className="mt-3 w-fit font-semibold underline underline-offset-4">
            Reintentar
          </Link>
        </Alert>
      )}
      {state.status === "unauthenticated" && <p>Inicia sesión para ver tus carreras.</p>}
      {state.status === "unverified" && <p>Verifica tu correo para ver tus carreras.</p>}
      {state.status === "ok" && state.bookings.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-medium">Aún no tienes carreras registradas.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cuando el equipo vincule tu reserva a esta cuenta, la encontrarás aquí.
          </p>
          <Link href="/#destinos" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
            Explorar experiencias
          </Link>
        </div>
      )}
      {state.status === "ok" && state.bookings.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {state.bookings.map((booking) => {
            const finished = state.today > (booking.trip.endDate ?? booking.trip.raceDate);
            const label = booking.status === "cancelled"
              ? BOOKING_STATUS_LABELS.cancelled
              : finished ? "Viaje terminado" : BOOKING_STATUS_LABELS[booking.status];
            return (
              <li key={booking.id} className="min-w-0 rounded-xl border border-border bg-card p-5">
                <Badge variant="secondary">{label}</Badge>
                <h3 className="mt-3 text-lg font-semibold">{booking.trip.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{booking.trip.city}, {booking.trip.country}</p>
                <p className="mt-1 text-sm">Carrera: {formatCalendarDate(booking.trip.raceDate)}</p>
                <Link
                  href={`/mis-carreras?reserva=${encodeURIComponent(booking.id)}`}
                  aria-label={`Ver mi reserva: ${booking.trip.title}`}
                  className="mt-4 inline-block font-semibold underline underline-offset-4"
                >
                  Ver mi reserva
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
