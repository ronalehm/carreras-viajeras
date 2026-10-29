import Link from "next/link";
import {
  ContactRound,
  ArrowUpRight,
  CalendarDays,
  Plus,
  TicketCheck,
  UserPlus,
  UserRoundSearch,
} from "lucide-react";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { leadStageSchema } from "../schemas/leads.schema";
import type {
  LeadReport,
  LeadReportFilters as ReportFilters,
} from "../types/leads.types";
import { formatCohort, LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import { LeadReportFilters } from "./LeadReportFilters";
import { LeadReportTable } from "./LeadReportTable";

type CrmDashboardProps = { report: LeadReport; filters: ReportFilters };

export function CrmDashboard({ report, filters }: CrmDashboardProps) {
  const scope = `${formatCohort(filters.cohort)} · ${filters.onlyImported ? "solo importados" : "sin importados"}`;
  const largestStage = Math.max(...Object.values(report.totals.stages));
  return (
    <section className="space-y-8">
      <CrmPageHeader
        title="Dashboard"
        description="Todo lo que necesitas para entender tus leads y acompañar su próxima meta."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/crm/leads"
              className={buttonVariants({
                variant: "ghost",
                className: "h-10 gap-2 rounded-xl px-4",
              })}
            >
              Ver leads
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link
              href="/crm/leads/nuevo"
              className={buttonVariants({
                className: "h-10 gap-2 rounded-xl px-4 shadow-xs",
              })}
            >
              <Plus aria-hidden="true" />
              Nuevo lead
            </Link>
          </div>
        }
      />
      <Card className="gap-5 rounded-2xl border border-border/60 py-5 shadow-xs ring-0 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
            >
              <CalendarDays className="size-4" strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Tu resumen comercial</h2>
              <p className="text-xs text-muted-foreground">
                Define el periodo y el viaje que quieres revisar.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary">
            {formatCohort(filters.cohort)}
          </span>
        </div>
        <CardContent className="border-t border-border/50 px-5 pt-5 sm:px-6 [&_button]:h-10 [&_button]:rounded-xl [&_button]:px-5 [&_form]:gap-3 [&_label]:text-xs [&_select]:h-10 [&_select]:rounded-xl">
          <LeadReportFilters
            filters={filters}
            cohorts={report.cohorts}
            tripOptions={report.tripOptions}
          />
        </CardContent>
      </Card>
      <div>
        <p className="mb-4 text-xs leading-5 text-muted-foreground">
          {scope} ·{" "}
          {report.tripOptions.find((trip) => trip.id === filters.tripId)
            ?.title ?? "Todos los viajes"}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <SummaryCard
            label="Total de leads"
            value={report.totals.total}
            icon={<ContactRound />}
            description="Leads de la cohorte seleccionada"
          />
          <SummaryCard
            label="Nuevos"
            value={report.totals.stages.new}
            icon={<UserPlus />}
            description="En su primera etapa de contacto"
          />
          <SummaryCard
            label="Reservados"
            value={report.totals.stages.reserved}
            icon={<TicketCheck />}
            description="En etapa Reservado actualmente"
          />
          <SummaryCard
            label="Sin responsable"
            value={report.totals.unassigned}
            icon={<UserRoundSearch />}
            description="Por asignar a una persona del equipo"
          />
        </div>
      </div>
      <Card className="gap-0 overflow-hidden rounded-2xl border border-border/60 pt-6 pb-0 shadow-xs ring-0">
        <CardHeader className="gap-2 px-5 pb-6 sm:px-6">
          <CardTitle className="font-semibold">
            Leads por origen y etapa
          </CardTitle>
          <CardDescription>
            Una vista de la etapa actual de los leads de esta cohorte. No son
            tasas de conversión.
          </CardDescription>
        </CardHeader>
        <section
          aria-label="Resumen por etapa"
          className="border-y border-border/60 bg-muted/25 px-5 py-5 sm:px-6"
        >
          <dl className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
            {leadStageSchema.options.map((stage) => (
              <div
                key={stage}
                role="group"
                aria-label={LEAD_STAGE_LABELS[stage]}
                className="space-y-2.5"
              >
                <dt className="text-xs text-muted-foreground">
                  {LEAD_STAGE_LABELS[stage]}
                </dt>
                <dd className="text-xl font-semibold tracking-tight tabular-nums">
                  {report.totals.stages[stage]}
                </dd>
                <div
                  aria-hidden="true"
                  className="h-1.5 overflow-hidden rounded-full bg-primary/7"
                >
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: `${largestStage > 0 ? (report.totals.stages[stage] / largestStage) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </section>
        <CardContent className="min-w-0 px-0 pt-2">
          <LeadReportTable report={report} filters={filters} />
        </CardContent>
      </Card>
    </section>
  );
}
