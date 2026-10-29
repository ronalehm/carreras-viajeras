import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import type { LeadListItem } from "../types/leads.types";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_STAGE_BADGE_VARIANTS,
  LEAD_STAGE_LABELS,
  leadOwnerLabel,
} from "../utils/leadDisplay";
import { LEAD_LIST_PATH } from "../utils/leadListQuery";
import { NextActionBadge } from "./NextActionBadge";

type LeadTableProps = {
  leads: LeadListItem[];
  hasFilters: boolean;
  // Today's CRM calendar date (YYYY-MM-DD): marks overdue and today's next actions.
  today: string;
};

// "Origen" is the channel (how the person found us), not the entry path.
const COLUMNS = ["Nombre", "WhatsApp", "Interés", "Etapa", "Próxima acción", "Responsable", "Origen"];

export function LeadTable({ leads, hasFilters, today }: LeadTableProps) {
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
            <TableCell>
              {lead.nextActionDate ? (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    {formatCalendarDate(lead.nextActionDate)}
                    <NextActionBadge date={lead.nextActionDate} today={today} />
                  </span>
                  {lead.nextActionNote && (
                    <span className="block max-w-48 truncate text-muted-foreground" title={lead.nextActionNote}>
                      {lead.nextActionNote}
                    </span>
                  )}
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{leadOwnerLabel(lead.owner)}</TableCell>
            <TableCell>{LEAD_CHANNEL_LABELS[lead.channel]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
