import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BOOKING_KIND_REAL, BOOKING_KIND_SIMULATED } from "../utils/bookingDisplay";

type BookingFiltersProps = {
  trips: { id: string; title: string }[];
  tripId?: string;
  /** undefined = all bookings (default), true = only simulated, false = only real. */
  simulated?: boolean;
};

// Plain GET form: the filters live in the URL (?viaje=<id>&tipo=reales|simuladas) and need no JavaScript.
// Without tipo the list shows real and simulated bookings together.
export function BookingFilters({ trips, tripId, simulated }: BookingFiltersProps) {
  return (
    <form method="get" action="/crm/reservas" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-filter-trip">Viaje</Label>
        <NativeSelect id="booking-filter-trip" name="viaje" defaultValue={tripId ?? ""}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {trips.map((trip) => (
            <NativeSelectOption key={trip.id} value={trip.id}>{trip.title}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-filter-kind">Tipo</Label>
        <NativeSelect
          id="booking-filter-kind"
          name="tipo"
          defaultValue={simulated === undefined ? "" : simulated ? BOOKING_KIND_SIMULATED : BOOKING_KIND_REAL}
        >
          <NativeSelectOption value="">Todas</NativeSelectOption>
          <NativeSelectOption value={BOOKING_KIND_REAL}>Reales</NativeSelectOption>
          <NativeSelectOption value={BOOKING_KIND_SIMULATED}>Simuladas (demo)</NativeSelectOption>
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">Filtrar</Button>
      <Link href="/crm/reservas" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
    </form>
  );
}
