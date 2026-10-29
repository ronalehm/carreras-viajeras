import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Mail,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  LeadListFilters,
  LeadPipelineData,
  LeadPipelineItem,
} from "../types/leads.types";
import { LEAD_STAGE_LABELS, leadOwnerLabel } from "../utils/leadDisplay";
import {
  getLeadAlerts,
  LEAD_EMAIL_STATUS_LABELS,
  PIPELINE_STAGES,
} from "../utils/leadGuidance";
import { leadListHref } from "../utils/leadListQuery";

type Props = {
  data: LeadPipelineData;
  filters: LeadListFilters;
  today: string;
};
export function LeadPipeline({ data, filters, today }: Props) {
  function card(lead: LeadPipelineItem) {
    const alerts = getLeadAlerts(lead, today);
    return (
      <Link
        key={lead.id}
        href={`/crm/leads/${lead.id}`}
        className="block rounded-2xl border border-border/70 bg-card p-4 shadow-xs hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-sm font-semibold break-words">
            {lead.fullName}
          </h3>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </div>
        <p className="mt-2 text-xs leading-5 break-words text-muted-foreground">
          {lead.trip?.title ?? lead.destinationText ?? "Interés por definir"}
        </p>
        {alerts[0] && (
          <p
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs",
              alerts[0].tone === "warning"
                ? "bg-destructive/8 text-destructive"
                : "bg-primary/7 text-primary",
            )}
          >
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            {alerts[0].title}
            {alerts.length > 1 && (
              <span aria-label={`${alerts.length - 1} avisos más`}>
                +{alerts.length - 1}
              </span>
            )}
          </p>
        )}
        <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
          {!lead.contactOptOutAt && lead.nextActionDate && (
            <p className="flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
              <time dateTime={lead.nextActionDate}>
                {formatCalendarDate(lead.nextActionDate)}
              </time>
            </p>
          )}
          {lead.nextActionNote && !lead.contactOptOutAt && (
            <p className="break-words">{lead.nextActionNote}</p>
          )}
          <p className="flex items-start gap-2 break-all">
            <UserRound
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {leadOwnerLabel(lead.owner)}
          </p>
          {!lead.email && (
            <p className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-3.5" />
              Correo no registrado
            </p>
          )}
          {lead.emailStatus?.stage === lead.stage && (
            <p className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-3.5 shrink-0" />
              Correo: {LEAD_EMAIL_STATUS_LABELS[lead.emailStatus.status]}
            </p>
          )}
        </div>
      </Link>
    );
  }
  function column(stage: (typeof PIPELINE_STAGES)[number]) {
    const col = data.columns.find((item) => item.stage === stage)!;
    const lost = stage === "lost";
    return (
      <section
        key={stage}
        id={`etapa-${stage}`}
        aria-label={`Etapa ${LEAD_STAGE_LABELS[stage]}`}
        className={cn(
          "flex-1 snap-start rounded-2xl p-3",
          lost
            ? "min-w-0 border border-dashed bg-card/60"
            : "min-w-64 bg-muted/50",
          filters.stage === stage && "ring-2 ring-primary/25",
          !filters.stage && !lost && "xl:w-0 xl:min-w-0",
        )}
      >
        <header className="mb-4 flex flex-wrap items-center gap-2 px-1">
          <h2 className="text-sm font-semibold">
            {lost && <X aria-hidden="true" className="mr-1 inline size-3.5" />}
            {LEAD_STAGE_LABELS[stage]}
          </h2>
          <span className="ml-auto rounded-md bg-card px-2 py-1 text-xs tabular-nums">
            {col.total}
          </span>
          {!lost && stage !== "paid" && (
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          )}
        </header>
        {lost && (
          <p className="mb-4 text-xs text-muted-foreground">
            Salida posible desde cualquier etapa.
          </p>
        )}
        <div
          className={
            lost ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "space-y-3"
          }
        >
          {col.leads.map(card)}
          {col.leads.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              Sin contactos en esta etapa con los filtros actuales.
            </p>
          )}
        </div>
        <p className="mt-4 px-1 text-xs text-muted-foreground">
          Mostrando {col.leads.length} de {col.total}
        </p>
        {col.total > 0 && (
          <Link
            href={leadListHref({ ...filters, stage, view: "list" }, 1)}
            className="mt-2 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-primary"
          >
            Ver lista de {LEAD_STAGE_LABELS[stage]}
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </section>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-sm leading-6 text-muted-foreground">
        Etapa actual de los contactos no archivados que coinciden con tus
        filtros. Abre una ficha para ver su recorrido y actualizar el
        seguimiento.
      </p>
      <nav aria-label="Etapas del embudo" className="mt-4 flex flex-wrap gap-2">
        {data.columns.map(({ stage, total }) => (
          <Link
            key={stage}
            href={leadListHref({ ...filters, stage }, 1)}
            aria-current={filters.stage === stage ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs",
              filters.stage === stage && "bg-primary/7 text-primary",
            )}
          >
            {LEAD_STAGE_LABELS[stage]}{" "}
            <span className="tabular-nums">{total}</span>
          </Link>
        ))}
        {filters.stage && (
          <Link
            href={leadListHref({ ...filters, stage: undefined }, 1)}
            className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-primary"
          >
            Ver todo el embudo
          </Link>
        )}
      </nav>
      {filters.stage !== "lost" && (
        <div className="mt-6 flex gap-4 overflow-x-auto overscroll-x-contain pb-4 [scroll-snap-type:x_proximity]">
          {PIPELINE_STAGES.filter(
            (stage) => !filters.stage || filters.stage === stage,
          ).map(column)}
        </div>
      )}
      {(!filters.stage || filters.stage === "lost") && (
        <div className="mt-5">{column("lost")}</div>
      )}
    </div>
  );
}
