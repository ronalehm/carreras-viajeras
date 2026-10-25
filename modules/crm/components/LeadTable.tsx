import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadListItem } from "../types/leads.types";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_BADGE_VARIANTS, LEAD_STAGE_LABELS } from "../utils/leadDisplay";

const COLUMNS = ["Nombre", "WhatsApp", "Interés", "Etapa", "Responsable", "Origen"];

function LeadInterest({ trip, destinationText }: Pick<LeadListItem, "trip" | "destinationText">) {
  if (!trip && !destinationText) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {trip && <p>{trip.title}</p>}
      {destinationText && <p className={trip ? "text-sm text-muted-foreground" : undefined}>{destinationText}</p>}
    </>
  );
}

function LeadOwner({ owner }: Pick<LeadListItem, "owner">) {
  if (!owner) return <span className="text-muted-foreground">Sin asignar</span>;
  return <>{owner.active ? owner.email : `${owner.email} (sin acceso)`}</>;
}

type LeadTableProps = {
  leads: LeadListItem[];
  hasFilters: boolean;
};

export function LeadTable({ leads, hasFilters }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground">
        {hasFilters ? "Ningún lead coincide con los filtros." : "Aún no hay leads. Registra el primero con «Nuevo lead»."}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => <TableHead key={title}>{title}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className="font-medium">{lead.fullName}</TableCell>
            <TableCell className="tabular-nums">{lead.phone}</TableCell>
            <TableCell><LeadInterest trip={lead.trip} destinationText={lead.destinationText} /></TableCell>
            <TableCell>
              <Badge variant={LEAD_STAGE_BADGE_VARIANTS[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</Badge>
            </TableCell>
            <TableCell><LeadOwner owner={lead.owner} /></TableCell>
            <TableCell>{LEAD_SOURCE_LABELS[lead.source]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
