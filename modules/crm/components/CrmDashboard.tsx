import Link from "next/link";
import {
  ContactRound,
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
import type {
  LeadReport,
  LeadReportFilters as ReportFilters,
} from "../types/leads.types";
import { formatCohort } from "../utils/leadDisplay";
import { LeadReportFilters } from "./LeadReportFilters";
import { LeadReportTable } from "./LeadReportTable";

type CrmDashboardProps = { report: LeadReport; filters: ReportFilters };

export function CrmDashboard({ report, filters }: CrmDashboardProps) {
  const scope = `${formatCohort(filters.cohort)} · ${filters.onlyImported ? "solo importados" : "sin importados"}`;
  return (
    <section className="space-y-7">
      <CrmPageHeader
        title="Dashboard"
        description="Una mirada a tus leads y al trabajo de tu equipo. Tu próxima meta empieza aquí."
        action={
          <Link href="/crm/leads/nuevo" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nuevo lead
          </Link>
        }
      />
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle>Tu resumen comercial</CardTitle>
          <CardDescription>
            Selecciona una cohorte y un viaje para explorar sus resultados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadReportFilters
            filters={filters}
            cohorts={report.cohorts}
            tripOptions={report.tripOptions}
          />
        </CardContent>
      </Card>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">
          {scope} ·{" "}
          {report.tripOptions.find((trip) => trip.id === filters.tripId)
            ?.title ?? "Todos los viajes"}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <Card className="gap-5 overflow-hidden shadow-none">
        <CardHeader className="border-b pb-5">
          <CardTitle>Leads por origen y etapa</CardTitle>
          <CardDescription>
            Conteos de la etapa actual de cada lead. No son tasas de conversión.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <LeadReportTable report={report} filters={filters} />
        </CardContent>
      </Card>
    </section>
  );
}
