// No server-only: client components import these helpers. Type-only imports keep the bundle small.
import type { CampaignStatus } from "../types/campaigns.types";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Activa",
  closed: "Cerrada",
};

// Public link of a campaign (the QR) and the stand-mode link for the team's tablet. origin is
// APP_ORIGIN (with or without a trailing slash); the path is absolute, so it never keeps one.
export function campaignLinks(
  origin: string,
  tripSlug: string,
  code: string,
): { registration: string; stand: string } {
  const registration = new URL(`/viajes/${encodeURIComponent(tripSlug)}/registro`, origin);
  registration.searchParams.set("c", code);
  const stand = new URL(registration);
  stand.searchParams.set("modo", "stand");
  return { registration: registration.toString(), stand: stand.toString() };
}
