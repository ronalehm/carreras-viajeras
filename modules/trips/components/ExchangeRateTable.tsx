import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { ExchangeRateListItem } from "../types/offers.types";

const COLUMNS = ["Tipo", "Desde", "Fijado por"];

// Latest rates as listExchangeRates returns them (newest first): the first row is the one in force.
export function ExchangeRateTable({ rates }: { rates: ExchangeRateListItem[] }) {
  if (rates.length === 0) {
    return <p className="text-muted-foreground">Aún no hay tipo de cambio: la web muestra solo dólares.</p>;
  }
  return (
    <Table>
      <TableCaption>Cada tipo rige desde que se guardó. El vigente es el más reciente.</TableCaption>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rates.map((rate, index) => (
          <TableRow key={rate.id}>
            <TableCell className="font-medium tabular-nums">
              <span className="inline-flex flex-wrap items-center gap-2">
                S/ {rate.usdPen} por US$ 1
                {index === 0 && <Badge>Vigente</Badge>}
              </span>
            </TableCell>
            <TableCell>{formatDateTime(rate.effectiveFrom)}</TableCell>
            <TableCell>{rate.createdBy.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
