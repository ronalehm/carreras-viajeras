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
  const filters = {
    cohort: query.cohort ?? getTodayDate().slice(0, 7),
    tripId: query.tripId,
    onlyImported: query.onlyImported,
  };
  const report = await getLeadReport(filters);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Leads por origen y etapa</h1>
      <LeadReportFilters filters={filters} cohorts={report.cohorts} tripOptions={report.tripOptions} />
      <LeadReportTable report={report} filters={filters} />
    </section>
  );
}
