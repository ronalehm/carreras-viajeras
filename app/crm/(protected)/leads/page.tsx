import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { Columns3, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import {
  getLeadList,
  getLeadPipeline,
  LeadPipeline,
  LeadFilters,
  LeadPagination,
  LeadStageSummary,
  LeadTable,
  leadListHref,
  parseLeadListQuery,
} from "@/modules/crm";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: PageProps<"/crm/leads">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un
          administrador.
        </p>
      </section>
    );
  }
  const params = await searchParams;
  const filters = parseLeadListQuery(params);
  // The native filter form also sends its empty "Todas"/"Todos" options: drop them from the URL.
  if (Object.values(params).includes(""))
    redirect(leadListHref(filters, filters.page));

  const today = getTodayDate();
  const showList = filters.view === "list" || filters.stage === "archived";
  const listFilters = { ...filters, view: "list" as const };
  const list = showList
    ? await getLeadList(filters, access.user.id, today)
    : null;
  const pipeline = showList
    ? null
    : await getLeadPipeline(filters, access.user.id, today);
  return (
    <section className="flex flex-col gap-6">
      <CrmPageHeader
        title="Embudo comercial"
        section="Leads"
        description="Cada contacto, su próxima acción y los avisos para avanzar."
        action={
          <Link
            href="/crm/leads/nuevo"
            className={buttonVariants({ className: "gap-2 rounded-xl" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Nuevo lead
          </Link>
        }
      />
      <nav
        aria-label="Vista de contactos"
        className="flex w-fit gap-1 rounded-xl border bg-card p-1"
      >
        <Link
          href={leadListHref(
            {
              ...filters,
              view: undefined,
              stage: filters.stage === "archived" ? undefined : filters.stage,
            },
            1,
          )}
          aria-current={!showList ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm",
            !showList && "bg-primary/7 font-medium text-primary",
          )}
        >
          <Columns3 aria-hidden="true" className="size-4" />
          Embudo
        </Link>
        <Link
          href={leadListHref({ ...filters, view: "list" }, 1)}
          aria-current={showList ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm",
            showList && "bg-primary/7 font-medium text-primary",
          )}
        >
          <List aria-hidden="true" className="size-4" />
          Lista
        </Link>
      </nav>
      {list && (
        <LeadStageSummary
          stageCounts={list.stageCounts}
          filters={listFilters}
        />
      )}
      <LeadFilters
        filters={showList ? listFilters : filters}
        ownerOptions={(list ?? pipeline)!.ownerOptions}
      />
      {filters.stage === "archived" && (
        <p className="text-sm text-muted-foreground">
          Contactos archivados · Solo lectura.
        </p>
      )}
      {pipeline && (
        <LeadPipeline data={pipeline} filters={filters} today={today} />
      )}
      {list && (
        <>
          <LeadTable
            leads={list.leads}
            hasFilters={
              filters.stage !== undefined ||
              filters.owner !== undefined ||
              filters.followUp !== undefined ||
              filters.channel !== undefined
            }
            today={today}
          />
          <LeadPagination
            filters={listFilters}
            hasNextPage={list.hasNextPage}
          />
        </>
      )}
    </section>
  );
}
