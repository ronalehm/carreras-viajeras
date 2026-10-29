import type { LucideIcon } from "lucide-react";
import {
  Bus,
  Check,
  ClipboardList,
  Compass,
  FileText,
  Flag,
  Hotel,
  MapPin,
  Plane,
  PlaneLanding,
  Ticket,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ItineraryStatus, Timeline, TimelineEntry } from "../types/bookings.types";
import {
  formatScheduleEdge,
  ITINERARY_KIND_LABELS,
  ITINERARY_STATUS_BADGE,
  ITINERARY_STATUS_LABELS,
  SCHEDULE_EDGE_LABELS,
} from "../utils/bookingDisplay";

const KIND_ICONS: Record<TimelineEntry["kind"], LucideIcon> = {
  booking: ClipboardList,
  payments: Wallet,
  document: FileText,
  registration: Ticket,
  flight: Plane,
  transfer: Bus,
  hotel: Hotel,
  activity: Compass,
  race: Flag,
  return: PlaneLanding,
};

const DOT_STYLES: Record<ItineraryStatus, string> = {
  pending: "border-2 border-primary bg-background",
  provisional: "border-2 border-dashed border-primary bg-background",
  confirmed: "bg-primary",
  completed: "bg-highlight text-primary-foreground",
  cancelled: "bg-muted-foreground/40",
};

// Only real data: derived entries carry a single date; items show each edge they have with its label.
function scheduleLines(entry: TimelineEntry): string[] {
  const { start, end } = entry;
  if (!start) return [];
  if (entry.kind === "booking") return [`Registrada · ${formatScheduleEdge(start)}`];
  if (entry.kind === "payments") return [`Fecha límite · ${formatScheduleEdge(start)}`];
  if (entry.derived) return [formatScheduleEdge(start)];
  const labels = SCHEDULE_EDGE_LABELS[entry.kind];
  const lines = [`${labels.start} ${formatScheduleEdge(start)}`];
  if (end) lines.push(`${labels.end} ${formatScheduleEdge(end)}`);
  return lines;
}

function Entry({ entry, unscheduled }: { entry: TimelineEntry; unscheduled: boolean }) {
  const Icon = KIND_ICONS[entry.kind];
  const badge = ITINERARY_STATUS_BADGE[entry.status];
  const cancelled = entry.status === "cancelled";
  // Derived entries ("Reserva", "Pagos", catalog race) are titled by their kind already.
  const kindLabel =
    entry.derived || entry.kind === "booking" || entry.kind === "payments" ? null : ITINERARY_KIND_LABELS[entry.kind];
  return (
    <li className={cn("relative pl-6", cancelled && "opacity-60")}>
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 -left-[9px] flex size-4 items-center justify-center rounded-full",
          DOT_STYLES[entry.status],
        )}
      >
        {entry.status === "completed" && <Check className="size-3" strokeWidth={3} />}
      </span>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-start gap-2">
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            {kindLabel && <p className="text-xs tracking-widest uppercase">{kindLabel}</p>}
            <p className={cn("font-bold break-words", cancelled && "line-through")}>{entry.title}</p>
          </div>
        </div>
        <Badge variant={badge.variant} className={badge.className}>
          {ITINERARY_STATUS_LABELS[entry.status]}
        </Badge>
      </div>
      <div className="mt-1 space-y-0.5 pl-6 text-sm break-words">
        {unscheduled && <p>Fecha por confirmar</p>}
        {scheduleLines(entry).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {entry.location && (
          <p className="flex items-start gap-1">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {entry.location}
          </p>
        )}
        {entry.details && <p className="whitespace-pre-line">{entry.details}</p>}
      </div>
    </li>
  );
}

function Group({
  title,
  entries,
  unscheduled = false,
  badge,
}: {
  title: string;
  entries: TimelineEntry[];
  unscheduled?: boolean;
  badge?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="border-l-3 border-highlight pl-2 text-xs font-bold tracking-[0.2em] uppercase">{title}</h3>
        {badge && (
          <Badge variant="outline" className="border-highlight bg-highlight/15">
            {badge}
          </Badge>
        )}
      </div>
      <ol className="ml-2 space-y-5 border-l-2 border-primary/25">
        {entries.map((entry) => (
          <Entry key={entry.key} entry={entry} unscheduled={unscheduled} />
        ))}
      </ol>
    </div>
  );
}

/** Main element of the portal (Requirement 8). A finished trip no longer shows the preparation notice. */
export function TripTimeline({
  timeline,
  finished,
  className,
}: {
  timeline: Timeline;
  finished: boolean;
  className?: string;
}) {
  return (
    <section aria-labelledby="trip-timeline-title" className={cn("space-y-6 text-primary", className)}>
      <h2 id="trip-timeline-title" className="text-xs font-bold tracking-[0.2em] uppercase">
        Tu línea de tiempo
      </h2>
      {!timeline.itineraryConfirmed && !finished && (
        <p className="text-sm">
          Estamos preparando tu itinerario. Los hitos pendientes se completarán cuando se confirmen.
        </p>
      )}
      <Group title="Antes de viajar" entries={timeline.preparation} />
      <Group
        title="Tu viaje"
        entries={timeline.trip}
        badge={timeline.itineraryConfirmed ? "Itinerario confirmado" : undefined}
      />
      <Group title="Por programar" entries={timeline.unscheduled} unscheduled />
    </section>
  );
}
