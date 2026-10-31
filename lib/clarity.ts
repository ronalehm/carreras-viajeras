import { z } from "zod";

// Microsoft Clarity (analytics-clarity spec): pure rules plus the few browser helpers they need.
// No server-only code and no getEnv(): the project id is a public build-time value.

/** The only hostname that may send data to the real Clarity project. */
export const CLARITY_HOSTNAME = "carreras-viajeras.mentec.dev";
/** Stable id of the tag's <script>, so next/script inserts it once per document. */
export const CLARITY_SCRIPT_ID = "microsoft-clarity";
export const ANALYTICS_CONSENT_KEY = "cv:analytics-consent:v1";
/** A decision lasts 180 days from when it was made; reading it never renews it. */
export const ANALYTICS_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/** Window event that reopens the consent banner (footer «Preferencias de analítica»). */
export const ANALYTICS_PREFERENCES_EVENT = "cv:analytics-preferences";

export type AnalyticsConsent = "granted" | "denied";
type ConsentV2 = { ad_Storage: AnalyticsConsent; analytics_Storage: AnalyticsConsent };
export type ClarityCommand = ["identify", string] | ["consentv2", ConsentV2];
/** window.clarity: our queue until the hosted tag replaces it with the real function. */
export type ClarityQueue = { (...command: ClarityCommand): void; q?: ClarityCommand[] };

declare global {
  interface Window {
    clarity?: ClarityQueue;
  }
}

export const CLARITY_CONSENT_GRANTED: ConsentV2 = { ad_Storage: "denied", analytics_Storage: "granted" };
export const CLARITY_CONSENT_DENIED: ConsentV2 = { ad_Storage: "denied", analytics_Storage: "denied" };

const PROJECT_ID = /^[a-z0-9]+$/i;
const CLARITY_COOKIES = ["_clck", "_clsk"] as const;
const EXPIRED = "expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/";

const storedConsentSchema = z.object({
  version: z.literal(1),
  analytics: z.enum(["granted", "denied"]),
  updatedAt: z.iso.datetime(),
});

/** The configured id when it is alphanumeric; anything else turns Clarity off (null). */
export function getClarityProjectId(raw: string | undefined): string | null {
  return raw !== undefined && PROJECT_ID.test(raw) ? raw : null;
}

/** Real data only from a production build served on the exact production hostname. */
export function isClarityEnvironment(nodeEnv: string | undefined, hostname: string): boolean {
  return nodeEnv === "production" && hostname === CLARITY_HOSTNAME;
}

export function clarityTagSrc(projectId: string): string {
  return `https://www.clarity.ms/tag/${projectId}`;
}

/**
 * Public pages where Clarity may run, by whole segments and without the query. Everything else
 * (CRM, API, account, runner portal, referral codes, registration and checkout) is denied.
 */
export function isClarityPathAllowed(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0];
  if (path === "/") return true;
  if (!path.startsWith("/")) return false;
  let segments: string[];
  try {
    segments = path.slice(1).split("/").map(decodeURIComponent);
  } catch {
    return false;
  }
  if (segments.some((segment) => segment === "" || segment.includes("/"))) return false;
  const [first, second, ...rest] = segments;
  if (rest.length > 0) return false;
  if (first === "contacto") return second === undefined;
  if (first === "noticias") return true;
  return first === "viajes" && second !== undefined && second !== "ficha_viaje";
}

/** The stored decision, or null (pending) when it is missing, corrupt, unknown, future or expired. */
export function readAnalyticsConsent(raw: string | null, now: number): AnalyticsConsent | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = storedConsentSchema.safeParse(value);
  if (!parsed.success) return null;
  const age = now - Date.parse(parsed.data.updatedAt);
  return age >= 0 && age <= ANALYTICS_CONSENT_MAX_AGE_MS ? parsed.data.analytics : null;
}

/** Reads localStorage; a blocked storage leaves the decision pending. */
export function getStoredAnalyticsConsent(now: number): AnalyticsConsent | null {
  try {
    return readAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_KEY), now);
  } catch {
    return null;
  }
}

/** Saves only the decision, its version and date. False when localStorage is blocked. */
export function writeAnalyticsConsent(analytics: AnalyticsConsent, now: number): boolean {
  try {
    const value = { version: 1, analytics, updatedAt: new Date(now).toISOString() };
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Expires Clarity's cookies (_clck, _clsk) as host-only, on the hostname and on its parent domain,
 * path /. No other cookie (Clerk, session, essentials) is touched.
 */
export function clearClarityCookies(hostname: string, target: { cookie: string } = document): void {
  const labels = hostname.split(".");
  const domains = [null, hostname, labels.length > 2 ? labels.slice(1).join(".") : null];
  const unique = domains.filter((domain, index) => index === 0 || (domain && domains.indexOf(domain) === index));
  try {
    for (const name of CLARITY_COOKIES) {
      for (const domain of unique) target.cookie = `${name}=; ${EXPIRED}${domain ? `; domain=${domain}` : ""}`;
    }
  } catch {
    // Sandboxed or opaque origins can refuse cookie writes: analytics must never break the page.
  }
}

/** Same queue as Clarity's official snippet; the hosted tag replays it when it loads. */
export function ensureClarityQueue(): ClarityQueue {
  if (window.clarity) return window.clarity;
  const queue: ClarityQueue = (...command) => {
    (queue.q ??= []).push(command);
  };
  window.clarity = queue;
  return queue;
}
