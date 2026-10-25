import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import {
  getLeadList,
  LeadFilters,
  LeadPagination,
  LeadStageSummary,
  LeadTable,
  leadListHref,
  parseLeadListQuery,
} from "@/modules/crm";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/crm/leads">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const params = await searchParams;
  const filters = parseLeadListQuery(params);
  // The native filter form also sends its empty "Todas"/"Todos" options: drop them from the URL.
  if (Object.values(params).includes("")) redirect(leadListHref(filters, filters.page));

  const today = getTodayDate();
  const list = await getLeadList(filters, access.user.id, today);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/crm/leads/nuevo" className={buttonVariants()}>Nuevo lead</Link>
      </div>
      <LeadStageSummary stageCounts={list.stageCounts} filters={filters} />
      <LeadFilters filters={filters} ownerOptions={list.ownerOptions} />
      <LeadTable
        leads={list.leads}
        hasFilters={
          filters.stage !== undefined ||
          filters.owner !== undefined ||
          filters.followUp !== undefined ||
          filters.source !== undefined
        }
        today={today}
      />
      <LeadPagination filters={filters} hasNextPage={list.hasNextPage} />
    </section>
  );
}
