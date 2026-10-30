import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BOOKING_KIND_SIMULATED } from "../utils/bookingDisplay";

type BookingFiltersProps = {
  trips: { id: string; title: string }[];
  tripId?: string;
  simulated: boolean;
};

// Plain GET form: the filters live in the URL (?viaje=<id>&tipo=simuladas) and need no JavaScript.
// Real and simulated bookings are listed apart, never together.
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
        <NativeSelect id="booking-filter-kind" name="tipo" defaultValue={simulated ? BOOKING_KIND_SIMULATED : ""}>
          <NativeSelectOption value="">Reales</NativeSelectOption>
          <NativeSelectOption value={BOOKING_KIND_SIMULATED}>Simuladas (demo)</NativeSelectOption>
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">Filtrar</Button>
      <Link href="/crm/reservas" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
    </form>
  );
}
