import type { z } from "zod";
import { leadListQuerySchema } from "../schemas/leads.schema";
import type { LeadListFilters } from "../types/leads.types";

type SearchParams = Record<string, string | string[] | undefined>;
type LeadListQuery = z.output<typeof leadListQuerySchema>;
type FollowUp = NonNullable<LeadListFilters["followUp"]>;
type StageFilter = NonNullable<LeadListFilters["stage"]>;

export const LEAD_LIST_PATH = "/crm/leads";

// Single mapping between filters and URL parameters (Spanish names, no personal data).
export const QUERY_KEYS = {
  stage: "etapa",
  owner: "responsable",
  followUp: "seguimiento",
  page: "pagina",
} as const satisfies Record<keyof LeadListFilters, keyof LeadListQuery>;
// Stage filters with their own URL value; a lead stage travels as itself.
export const STAGE_PARAMS = {
  archived: "archivados",
} as const satisfies Partial<Record<StageFilter, NonNullable<LeadListQuery["etapa"]>>>;

// Owner filters with their own URL value; any other value is a staff user id.
export const OWNER_PARAMS = { mine: "mios", unassigned: "sin-asignar" } as const;
type OwnerKeyword = keyof typeof OWNER_PARAMS;

// Follow-up filters and their URL values.
export const FOLLOW_UP_PARAMS = {
  overdue: "vencidos",
  pending: "pendientes",
} as const satisfies Record<FollowUp, NonNullable<LeadListQuery["seguimiento"]>>;

const isOwnerKeyword = (value: string): value is OwnerKeyword => Object.hasOwn(OWNER_PARAMS, value);

// Only the Spanish URL values select a keyword filter. The filter names themselves
// ("mine", "unassigned") are invalid in the URL and mean "no owner filter".
function ownerFromParam(param: string | undefined): LeadListFilters["owner"] {
  if (param === undefined || isOwnerKeyword(param)) return undefined;
  const keyword = (Object.keys(OWNER_PARAMS) as OwnerKeyword[]).find((key) => OWNER_PARAMS[key] === param);
  return keyword ?? param;
}

// URL value of an owner filter: the keyword's Spanish value or the staff user id itself.
export function ownerToParam(owner: string): string {
  return isOwnerKeyword(owner) ? OWNER_PARAMS[owner] : owner;
}

// Only "archivados" selects the archived leads: "archived" is invalid in the URL (no stage filter).
function stageFromParam(param: LeadListQuery["etapa"]): LeadListFilters["stage"] {
  return param === STAGE_PARAMS.archived ? "archived" : param;
}

// URL value of a stage filter: "archivados" for the archived leads, the stage itself otherwise.
export function stageToParam(stage: StageFilter): string {
  return stage === "archived" ? STAGE_PARAMS.archived : stage;
}

function followUpFromParam(param: LeadListQuery["seguimiento"]): LeadListFilters["followUp"] {
  return (Object.keys(FOLLOW_UP_PARAMS) as FollowUp[]).find((key) => FOLLOW_UP_PARAMS[key] === param);
}

export function parseLeadListQuery(searchParams: SearchParams): LeadListFilters {
  const query = leadListQuerySchema.parse(searchParams);
  return {
    stage: stageFromParam(query[QUERY_KEYS.stage]),
    owner: ownerFromParam(query[QUERY_KEYS.owner]),
    followUp: followUpFromParam(query[QUERY_KEYS.followUp]),
    page: query[QUERY_KEYS.page],
  };
}

// Default values (no stage, no owner, no follow-up, page 1) are left out of the URL.
export function leadListHref(filters: LeadListFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.stage) params.set(QUERY_KEYS.stage, stageToParam(filters.stage));
  if (filters.owner) params.set(QUERY_KEYS.owner, ownerToParam(filters.owner));
  if (filters.followUp) params.set(QUERY_KEYS.followUp, FOLLOW_UP_PARAMS[filters.followUp]);
  if (page > 1) params.set(QUERY_KEYS.page, String(page));
  const query = params.toString();
  return query ? `${LEAD_LIST_PATH}?${query}` : LEAD_LIST_PATH;
}
