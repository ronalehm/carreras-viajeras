import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type BookingFiltersProps = {
  trips: { id: string; title: string }[];
  tripId?: string;
};

// Plain GET form: the filter lives in the URL (?viaje=<id>) and needs no JavaScript.
export function BookingFilters({ trips, tripId }: BookingFiltersProps) {
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
      <Button type="submit" variant="outline">Filtrar</Button>
      <Link href="/crm/reservas" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
    </form>
  );
}
