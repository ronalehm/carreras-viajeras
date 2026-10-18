import type { z } from "zod";
import { leadListQuerySchema } from "../schemas/leads.schema";
import type { LeadListFilters } from "../types/leads.types";

type SearchParams = Record<string, string | string[] | undefined>;

const LEAD_LIST_PATH = "/crm/leads";

// Single mapping between filters and URL parameters (Spanish names, no personal data).
const QUERY_KEYS = {
  stage: "etapa",
  owner: "responsable",
  page: "pagina",
} as const satisfies Record<keyof LeadListFilters, keyof z.output<typeof leadListQuerySchema>>;
const MINE = { filter: "mine", param: "mios" } as const;

export function parseLeadListQuery(searchParams: SearchParams): LeadListFilters {
  const query = leadListQuerySchema.parse(searchParams);
  const owner = query[QUERY_KEYS.owner];
  return {
    stage: query[QUERY_KEYS.stage],
    owner: owner === MINE.param ? MINE.filter : owner,
    page: query[QUERY_KEYS.page],
  };
}

// Default values (no stage, no owner, page 1) are left out of the URL.
export function leadListHref(filters: LeadListFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.stage) params.set(QUERY_KEYS.stage, filters.stage);
  if (filters.owner) {
    params.set(QUERY_KEYS.owner, filters.owner === MINE.filter ? MINE.param : filters.owner);
  }
  if (page > 1) params.set(QUERY_KEYS.page, String(page));
  const query = params.toString();
  return query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
}
