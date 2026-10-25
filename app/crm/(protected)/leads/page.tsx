import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
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

type SearchParams = Awaited<PageProps<"/crm/leads">["searchParams"]>;

// The received query as leadListHref would write it, to compare with the canonical one.
function currentHref(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of [value ?? []].flat()) params.append(key, item);
  }
  const query = params.toString();
  return query ? `/crm/leads?${query}` : "/crm/leads";
}

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
  // The GET filter form also sends empty and default values (?etapa=&responsable=mios): go to the
  // canonical URL. The canonical query parses back to the same filters, so this never loops.
  const canonical = leadListHref(filters, filters.page);
  if (currentHref(query) !== canonical) redirect(canonical);

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
