// Server Components only for the services: they are server-only.
export { listLeadActivities } from "./services/activities.service";
export {
  getLeadById,
  getLeadFormOptions,
  getLeadList,
} from "./services/leads.service";
export { getLeadReport } from "./services/leadReport.service";
export { leadReportQuerySchema } from "./schemas/leads.schema";
export { leadListHref, parseLeadListQuery } from "./utils/leadListQuery";
// Also exported so that every leads route reaches the actions from its server graph: an action
// imported only from a client component is compiled in a separate layer with its own copy of
// drizzle, the Neon driver and zod (~250 KiB gzip more in the Worker).
export {
  addLeadActivityAction,
  archiveLeadAction,
  changeLeadOwnerAction,
  changeLeadStageAction,
  createLeadAction,
  optOutLeadAction,
  setNextActionAction,
  updateLeadAction,
} from "./actions/leads.actions";
// Campaigns (QR and links): same reason, the CRM routes import both actions from this API.
export { listCampaigns, getCampaignById } from "./services/campaigns.service";
export {
  closeCampaignAction,
  createCampaignAction,
} from "./actions/campaigns.actions";
export { CampaignForm } from "./components/CampaignForm";
export { CampaignQr } from "./components/CampaignQr";
export { CampaignTable } from "./components/CampaignTable";
export { CAMPAIGN_STATUS_LABELS, campaignLinks } from "./utils/campaignDisplay";
// Public web form action: the app/ pages pass it as a prop to the landing's RaceRegistrationSection
// and ContactSection, so the landing never imports crm from a client component.
export { submitWebLeadAction } from "./actions/webLeads.actions";
export type { WebLeadFormState } from "./types/webLeads.types";
export { ActivityForm } from "./components/ActivityForm";
export { LeadDetails } from "./components/LeadDetails";
export { LeadFilters } from "./components/LeadFilters";
export { LeadForm } from "./components/LeadForm";
export { LeadOwnerForm } from "./components/LeadOwnerForm";
export { LeadPagination } from "./components/LeadPagination";
export { LeadReportFilters } from "./components/LeadReportFilters";
export { CrmDashboard } from "./components/CrmDashboard";
export { LeadReportTable } from "./components/LeadReportTable";
export { LeadStageForm } from "./components/LeadStageForm";
export { LeadStageSummary } from "./components/LeadStageSummary";
export { LeadTable } from "./components/LeadTable";
export { LeadTimeline } from "./components/LeadTimeline";
export { NextActionForm } from "./components/NextActionForm";
export {
  CLOSED_LEAD_STAGES,
  LEAD_CHANNEL_LABELS,
  LEAD_STAGE_BADGE_VARIANTS,
  LEAD_STAGE_LABELS,
} from "./utils/leadDisplay";
