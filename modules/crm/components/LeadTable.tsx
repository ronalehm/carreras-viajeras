import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadListItem } from "../types/leads.types";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_BADGE_VARIANTS,
  LEAD_STAGE_LABELS,
  leadOwnerLabel,
} from "../utils/leadDisplay";
import { LEAD_LIST_PATH } from "../utils/leadListQuery";

type LeadTableProps = {
  leads: LeadListItem[];
  hasFilters: boolean;
};

const COLUMNS = ["Nombre", "WhatsApp", "Interés", "Etapa", "Responsable", "Origen"];

export function LeadTable({ leads, hasFilters }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground">
        {hasFilters
          ? "Ningún lead coincide con los filtros."
          : "Aún no hay leads. Registra el primero con «Nuevo lead»."}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className="font-medium">
              <Link href={`${LEAD_LIST_PATH}/${lead.id}`} className="underline-offset-4 hover:underline">
                {lead.fullName}
              </Link>
            </TableCell>
            <TableCell className="tabular-nums">{lead.phone}</TableCell>
            <TableCell>
              {[lead.trip?.title, lead.destinationText].filter(Boolean).join(" · ") || "—"}
            </TableCell>
            <TableCell>
              <Badge variant={LEAD_STAGE_BADGE_VARIANTS[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</Badge>
            </TableCell>
            <TableCell>{leadOwnerLabel(lead.owner)}</TableCell>
            <TableCell>{LEAD_SOURCE_LABELS[lead.source]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
