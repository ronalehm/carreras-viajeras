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

// Single map of the owner presets and their URL values; any other value is a staff user id and
// passes through unchanged.
export const LEAD_OWNER_PARAMS = { mine: "mios", unassigned: "sin-asignar" } as const;
type OwnerPreset = keyof typeof LEAD_OWNER_PARAMS;
const OWNER_PRESETS = Object.keys(LEAD_OWNER_PARAMS) as OwnerPreset[];

function isOwnerPreset(owner: string): owner is OwnerPreset {
  return Object.hasOwn(LEAD_OWNER_PARAMS, owner);
}

function ownerFromParam(param: string | undefined): LeadListFilters["owner"] {
  return OWNER_PRESETS.find((preset) => LEAD_OWNER_PARAMS[preset] === param) ?? param;
}

// The `responsable` URL value of an owner filter.
export function leadOwnerParam(owner: string): string {
  return isOwnerPreset(owner) ? LEAD_OWNER_PARAMS[owner] : owner;
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
  if (filters.owner) params.set(QUERY_KEYS.owner, leadOwnerParam(filters.owner));
  if (page > 1) params.set(QUERY_KEYS.page, String(page));
  const query = params.toString();
  return query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
}

// Whether the received query is exactly the canonical URL of its filters. The GET filter form also
// sends empty and default values (?etapa=&responsable=), and keys may repeat, come in another order
// or be unknown: all of those are not canonical. The canonical query parses back to the same
// filters, so redirecting to it never loops.
export function isCanonicalLeadListQuery(searchParams: SearchParams, filters: LeadListFilters): boolean {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of [value ?? []].flat()) params.append(key, item);
  }
  const query = params.toString();
  const received = query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
  return received === leadListHref(filters, filters.page);
}
