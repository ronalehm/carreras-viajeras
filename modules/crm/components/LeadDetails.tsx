import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadDetail } from "../types/leads.types";
import { LEAD_SOURCE_LABELS, leadOwnerLabel, leadTripLabel } from "../utils/leadDisplay";

type LeadDetailsProps = {
  lead: Pick<
    LeadDetail,
    | "phone"
    | "email"
    | "location"
    | "trip"
    | "destinationText"
    | "source"
    | "consentVersion"
    | "createdBy"
    | "owner"
    | "lostReason"
  >;
};

type Item = { label: string; value: ReactNode };

const EMPTY = "—";

function DetailCard({ title, items }: { title: string; items: Item[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {items.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// Presentation only. Dates are left out: the creation date (also the manual consent date)
// belongs to the history. A web form lead has no author: "Registrado por" shows the source.
export function LeadDetails({ lead }: LeadDetailsProps) {
  const link = "underline underline-offset-4 hover:text-primary";
  const management: Item[] = [{ label: "Responsable", value: leadOwnerLabel(lead.owner) }];
  if (lead.lostReason) management.push({ label: "Motivo de la pérdida", value: lead.lostReason });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DetailCard
        title="Contacto"
        items={[
          {
            label: "WhatsApp o teléfono",
            value: <a href={`tel:${lead.phone}`} className={cn(link, "tabular-nums")}>{lead.phone}</a>,
          },
          {
            label: "Email",
            value: lead.email ? <a href={`mailto:${lead.email}`} className={link}>{lead.email}</a> : EMPTY,
          },
          { label: "Ciudad o país", value: lead.location ?? EMPTY },
        ]}
      />
      <DetailCard
        title="Interés"
        items={[
          { label: "Viaje del catálogo", value: lead.trip ? leadTripLabel(lead.trip) : EMPTY },
          { label: "Destino (texto libre)", value: lead.destinationText ?? EMPTY },
        ]}
      />
      <DetailCard
        title="Registro"
        items={[
          { label: "Origen", value: LEAD_SOURCE_LABELS[lead.source] },
          { label: "Consentimiento", value: `Versión ${lead.consentVersion}` },
          { label: "Registrado por", value: lead.createdBy?.email ?? LEAD_SOURCE_LABELS.web_form },
        ]}
      />
      <DetailCard title="Gestión" items={management} />
    </div>
  );
}
