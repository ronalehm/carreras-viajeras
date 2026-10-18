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
// Owner filters with their own URL value; any other value is a staff user id.
const OWNER_PARAMS = { mine: "mios", unassigned: "sin-asignar" } as const;
type OwnerKeyword = keyof typeof OWNER_PARAMS;

const isOwnerKeyword = (value: string): value is OwnerKeyword => Object.hasOwn(OWNER_PARAMS, value);

// Only the Spanish URL values select a keyword filter. The filter names themselves
// ("mine", "unassigned") are invalid in the URL and mean "no owner filter".
function ownerFromParam(param: string | undefined): LeadListFilters["owner"] {
  if (param === undefined || isOwnerKeyword(param)) return undefined;
  const keyword = (Object.keys(OWNER_PARAMS) as OwnerKeyword[]).find((key) => OWNER_PARAMS[key] === param);
  return keyword ?? param;
}

export function parseLeadListQuery(searchParams: SearchParams): LeadListFilters {
  const query = leadListQuerySchema.parse(searchParams);
  return {
    stage: query[QUERY_KEYS.stage],
    owner: ownerFromParam(query[QUERY_KEYS.owner]),
    page: query[QUERY_KEYS.page],
  };
}

// Default values (no stage, no owner, page 1) are left out of the URL.
export function leadListHref(filters: LeadListFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.stage) params.set(QUERY_KEYS.stage, filters.stage);
  if (filters.owner) {
    params.set(QUERY_KEYS.owner, isOwnerKeyword(filters.owner) ? OWNER_PARAMS[filters.owner] : filters.owner);
  }
  if (page > 1) params.set(QUERY_KEYS.page, String(page));
  const query = params.toString();
  return query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
}
