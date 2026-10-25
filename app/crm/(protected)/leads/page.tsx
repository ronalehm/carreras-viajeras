import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess } from "@/modules/accounts";
import {
  getLeadList,
  isCanonicalLeadListQuery,
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

  const query = await searchParams;
  const filters = parseLeadListQuery(query);
  // Empty, default, repeated or unknown parameters go to the canonical URL (it never loops).
  if (!isCanonicalLeadListQuery(query, filters)) redirect(leadListHref(filters, filters.page));

  const { leads, hasNextPage, stageCounts, ownerOptions } = await getLeadList(filters, access.user.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/crm/leads/nuevo" className={buttonVariants()}>Nuevo lead</Link>
      </div>
      <LeadStageSummary stageCounts={stageCounts} filters={filters} />
      <LeadFilters filters={filters} ownerOptions={ownerOptions} />
      <LeadTable leads={leads} hasFilters={filters.stage !== undefined || filters.owner !== undefined} />
      <LeadPagination filters={filters} hasNextPage={hasNextPage} />
    </section>
  );
}
