import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { leadStageSchema } from "../schemas/leads.schema";
import type { LeadReport, LeadReportFilters, LeadReportRow } from "../types/leads.types";
import { LEAD_CHANNEL_LABELS, LEAD_STAGE_LABELS } from "../utils/leadDisplay";

type LeadReportTableProps = {
  report: Pick<LeadReport, "rows" | "totals" | "tripOptions">;
  filters: LeadReportFilters;
};

// A cohort month (YYYY-MM) as shown in the filter and the caption: "octubre de 2026". Read in UTC
// so the month never shifts.
const cohortFormat = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatCohort(cohort: string): string {
  return cohortFormat.format(new Date(`${cohort}-01T00:00:00Z`));
}

const NUMBER_CELL = "text-right tabular-nums";

function CountCells({ counts }: { counts: Omit<LeadReportRow, "channel"> }) {
  return (
    <>
      <TableCell className={NUMBER_CELL}>{counts.total}</TableCell>
      {leadStageSchema.options.map((stage) => (
        <TableCell key={stage} className={NUMBER_CELL}>
          {counts.stages[stage]}
        </TableCell>
      ))}
      <TableCell className={NUMBER_CELL}>{counts.optedOut}</TableCell>
      <TableCell className={NUMBER_CELL}>{counts.unassigned}</TableCell>
    </>
  );
}

// Counts of the current stage of one cohort (Decision 15): no rates and no links to the list,
// which does not filter by cohort.
export function LeadReportTable({ report, filters }: LeadReportTableProps) {
  if (report.rows.length === 0) {
    return <p className="text-muted-foreground">No hay leads en esta cohorte.</p>;
  }
  const trip = filters.tripId
    ? (report.tripOptions.find((option) => option.id === filters.tripId)?.title ?? "Viaje no disponible")
    : "Todos los viajes";
  const imported = filters.onlyImported ? "solo importados" : "sin importados";
  return (
    <Table>
      <TableCaption>
        Leads dados de alta en {formatCohort(filters.cohort)} · {trip} · {imported}. Conteos de la etapa actual,
        sin archivados. No son tasas de conversión.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Origen</TableHead>
          <TableHead className="text-right">Total</TableHead>
          {leadStageSchema.options.map((stage) => (
            <TableHead key={stage} className="text-right">
              {LEAD_STAGE_LABELS[stage]}
            </TableHead>
          ))}
          <TableHead className="text-right">Pidieron no seguir</TableHead>
          <TableHead className="text-right">Sin responsable</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.rows.map((row) => (
          <TableRow key={row.channel}>
            <TableCell className="font-medium">{LEAD_CHANNEL_LABELS[row.channel]}</TableCell>
            <CountCells counts={row} />
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <CountCells counts={report.totals} />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
