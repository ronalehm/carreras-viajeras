import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { leadReportQuerySchema } from "../schemas/leads.schema";
import type { LeadReport, LeadReportFilters as ReportFilters } from "../types/leads.types";
import { formatCohort, leadTripLabel } from "../utils/leadDisplay";

type LeadReportFiltersProps = {
  filters: ReportFilters;
  cohorts: LeadReport["cohorts"];
  tripOptions: LeadReport["tripOptions"];
};

// URL parameters read by leadReportQuerySchema.
const PARAMS = {
  cohort: "cohorte",
  trip: "viaje",
  imported: "importados",
} as const satisfies Record<string, keyof z.input<typeof leadReportQuerySchema>>;
const ONLY_IMPORTED = "solo" satisfies z.input<typeof leadReportQuerySchema>["importados"];

// Native GET form, no client JavaScript: the report filters travel in the URL of /crm.
export function LeadReportFilters({ filters, cohorts, tripOptions }: LeadReportFiltersProps) {
  return (
    <form method="get" action="/crm" className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-report-cohort">Cohorte (mes de alta)</Label>
        <NativeSelect id="lead-report-cohort" name={PARAMS.cohort} defaultValue={filters.cohort}>
          {cohorts.map((cohort) => (
            <NativeSelectOption key={cohort} value={cohort}>
              {formatCohort(cohort)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-report-trip">Viaje</Label>
        <NativeSelect id="lead-report-trip" name={PARAMS.trip} defaultValue={filters.tripId ?? ""}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {tripOptions.map((trip) => (
            <NativeSelectOption key={trip.id} value={trip.id}>
              {leadTripLabel(trip)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-report-imported">Importados</Label>
        <NativeSelect
          id="lead-report-imported"
          name={PARAMS.imported}
          defaultValue={filters.onlyImported ? ONLY_IMPORTED : ""}
        >
          <NativeSelectOption value="">Excluir</NativeSelectOption>
          <NativeSelectOption value={ONLY_IMPORTED}>Solo importados</NativeSelectOption>
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">Filtrar</Button>
    </form>
  );
}
