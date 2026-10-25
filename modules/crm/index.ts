// Public API of the CRM. The services are server-only: createWebLead (lead capture from the landing)
// and the reads of the CRM lead pages.
export { createWebLead, getLeadFormOptions, getLeadList } from "./services/leads.service";
// Field rules shared with the landing form schema, so web and manual leads normalize the same way.
export { leadEmailSchema, leadFullNameSchema, leadPhoneSchema } from "./schemas/leads.schema";
export { isCanonicalLeadListQuery, leadListHref, parseLeadListQuery } from "./utils/leadListQuery";
// Only LeadForm (a client component) uses this action. Re-exported here so RSC also reach it and
// Next does not bundle a second copy of its server code into the Worker.
export { createLeadAction } from "./actions/leads.actions";
export { LeadFilters } from "./components/LeadFilters";
export { LeadForm } from "./components/LeadForm";
export { LeadPagination } from "./components/LeadPagination";
export { LeadStageSummary } from "./components/LeadStageSummary";
export { LeadTable } from "./components/LeadTable";
export type { WebLeadInput } from "./types/leads.types";
