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
import { Inbox } from "lucide-react";
import { leadStageSchema } from "../schemas/leads.schema";
import type {
  LeadReport,
  LeadReportFilters,
  LeadReportRow,
} from "../types/leads.types";
import {
  formatCohort,
  LEAD_CHANNEL_LABELS,
  LEAD_STAGE_LABELS,
} from "../utils/leadDisplay";

type LeadReportTableProps = {
  report: Pick<LeadReport, "rows" | "totals" | "tripOptions">;
  filters: LeadReportFilters;
};

const NUMBER_CELL = "text-right tabular-nums";

function CountCells({ counts }: { counts: Omit<LeadReportRow, "channel"> }) {
  return (
    <>
      <TableCell className={`${NUMBER_CELL} font-semibold`}>
        {counts.total}
      </TableCell>
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
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 px-6 py-12 text-center"
      >
        <span
          aria-hidden="true"
          className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
        >
          <Inbox className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-sm font-medium">No hay leads en esta cohorte.</p>
        <p className="max-w-sm text-xs leading-6 text-muted-foreground">
          Prueba otro periodo o viaje, o registra tu primer lead para empezar a
          ver sus resultados.
        </p>
      </div>
    );
  }
  // The page only passes a trip that is among the options.
  const trip =
    report.tripOptions.find((option) => option.id === filters.tripId)?.title ??
    "Todos los viajes";
  const imported = filters.onlyImported ? "solo importados" : "sin importados";
  return (
    <Table className="[&_td]:h-14 [&_td]:px-5 [&_th]:px-5 sm:[&_td]:px-6 sm:[&_th]:px-6">
      <TableCaption className="px-5 pt-1 pb-6 text-left text-xs leading-6 sm:px-6">
        Leads dados de alta en {formatCohort(filters.cohort)} · {trip} ·{" "}
        {imported}. Conteos de la etapa actual, sin archivados. No son tasas de
        conversión.
      </TableCaption>
      <TableHeader className="bg-muted/30 [&_th]:h-12 [&_th]:text-xs [&_th]:text-muted-foreground">
        <TableRow className="hover:bg-transparent">
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
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary/50"
                />
                {LEAD_CHANNEL_LABELS[row.channel]}
              </span>
            </TableCell>
            <CountCells counts={row} />
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-primary/4 text-foreground">
        <TableRow className="hover:bg-transparent">
          <TableCell className="font-semibold">Total</TableCell>
          <CountCells counts={report.totals} />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
