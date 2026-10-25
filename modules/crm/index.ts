// Public API of the CRM. Server code only: createWebLead is server-only (lead capture from the landing).
export { createWebLead } from "./services/leads.service";
// Field rules shared with the landing form schema, so web and manual leads normalize the same way.
export { leadEmailSchema, leadFullNameSchema, leadPhoneSchema } from "./schemas/leads.schema";
export type { WebLeadInput } from "./types/leads.types";
