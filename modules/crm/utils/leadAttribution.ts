import { campaignCodeSchema } from "../schemas/campaigns.schema";

// Attribution parameters of the web capture (?c=, UTM and ref). They come from the URL and are
// never trusted: an invalid value becomes null, never an error, so the registration goes on.
const UTM_PATTERN = /^[a-z0-9._~+-]{1,100}$/;
const REFERRAL_PATTERN = /^[a-z0-9._~+-]{2,60}$/;

function normalizeToken(value: string | null | undefined, pattern: RegExp): string | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  return pattern.test(normalized) ? normalized : null;
}

// ?c=: a valid campaign code (campaignCodeSchema) or null. The server still checks that the
// campaign is active and belongs to the trip.
export function normalizeCampaignCode(value: string | null | undefined): string | null {
  const result = campaignCodeSchema.safeParse(value);
  return result.success ? result.data : null;
}

// utm_source, utm_medium, utm_campaign: trimmed, lowercase, [a-z0-9._~+-]{1,100}.
export function normalizeUtm(value: string | null | undefined): string | null {
  return normalizeToken(value, UTM_PATTERN);
}

// ref → leads.referred_by: same rule as the UTM values with 2 to 60 characters.
export function normalizeReferral(value: string | null | undefined): string | null {
  return normalizeToken(value, REFERRAL_PATTERN);
}

// Fixed note of a repeated registration (re_registered activity): only the parts with a value,
// joined with " · ". The campaign part is added by the statement that resolves the campaign.
export function reRegistrationNote(input: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referredBy: string | null;
  consentVersion: string;
  marketingOptIn: boolean;
}): string {
  const utm = [input.utmSource, input.utmMedium, input.utmCampaign].filter(Boolean).join(" / ");
  return [
    utm && `UTM: ${utm}`,
    input.referredBy && `Ref: ${input.referredBy}`,
    `Texto legal ${input.consentVersion}`,
    `Promociones: ${input.marketingOptIn ? "sí" : "no"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
