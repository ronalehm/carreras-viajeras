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

// Owner presets and their URL values; any other value is a staff user id and passes through.
const OWNER_PARAMS = { mine: "mios", unassigned: "sin-asignar" } as const;
type OwnerPreset = keyof typeof OWNER_PARAMS;
const OWNER_PRESETS = Object.keys(OWNER_PARAMS) as OwnerPreset[];

function isOwnerPreset(owner: string): owner is OwnerPreset {
  return Object.hasOwn(OWNER_PARAMS, owner);
}

function ownerFromParam(param: string | undefined): LeadListFilters["owner"] {
  return OWNER_PRESETS.find((preset) => OWNER_PARAMS[preset] === param) ?? param;
}

function ownerToParam(owner: string): string {
  return isOwnerPreset(owner) ? OWNER_PARAMS[owner] : owner;
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
  if (filters.owner) params.set(QUERY_KEYS.owner, ownerToParam(filters.owner));
  if (page > 1) params.set(QUERY_KEYS.page, String(page));
  const query = params.toString();
  return query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
}
