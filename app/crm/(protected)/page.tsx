import { redirect } from "next/navigation";
import { getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import { getLeadReport, LeadReportFilters, LeadReportTable, leadReportQuerySchema } from "@/modules/crm";

export default async function CrmHomePage({ searchParams }: PageProps<"/crm">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Bienvenido al CRM de Carreras Viajeras</h1>
        <p className="text-muted-foreground">Pronto verás aquí tus leads y viajes.</p>
      </section>
    );
  }

  const query = leadReportQuerySchema.parse(await searchParams);
  let filters = {
    cohort: query.cohort ?? getTodayDate().slice(0, 7),
    tripId: query.tripId,
    onlyImported: query.onlyImported,
  };
  let report = await getLeadReport(filters);
  // A trip that no longer exists or is archived is not offered: discard it, so the counts, the
  // trip filter and the caption show every trip.
  if (filters.tripId && !report.tripOptions.some((trip) => trip.id === filters.tripId)) {
    filters = { ...filters, tripId: undefined };
    report = await getLeadReport(filters);
  }
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Leads por origen y etapa</h1>
      <LeadReportFilters filters={filters} cohorts={report.cohorts} tripOptions={report.tripOptions} />
      <LeadReportTable report={report} filters={filters} />
    </section>
  );
}
