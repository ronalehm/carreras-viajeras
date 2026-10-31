import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  CLARITY_HOSTNAME,
  clearClarityCookies,
  ensureClarityQueue,
  getClarityProjectId,
  getStoredAnalyticsConsent,
  isClarityEnvironment,
  isClarityPathAllowed,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "./clarity";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-31T12:00:00.000Z");

function stored(value: unknown) {
  return JSON.stringify(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete window.clarity;
});

describe("getClarityProjectId", () => {
  it("returns an alphanumeric id", () => {
    expect(getClarityProjectId("z63dn24o7t")).toBe("z63dn24o7t");
    expect(getClarityProjectId("ABC123")).toBe("ABC123");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["a script injection", "z63dn24o7t\"></script>"],
    ["a path", "z63dn24o7t/../x"],
    ["spaces around it", " z63dn24o7t "],
    ["a hyphen", "z63-dn24"],
    ["an accented letter", "z63dñ24"],
  ])("is null when %s", (_, raw) => {
    expect(getClarityProjectId(raw)).toBeNull();
  });
});

describe("isClarityEnvironment", () => {
  it("is active only in production on the exact production hostname", () => {
    expect(isClarityEnvironment("production", CLARITY_HOSTNAME)).toBe(true);
    expect(CLARITY_HOSTNAME).toBe("carreras-viajeras.mentec.dev");
  });

  it.each(["development", "test", undefined])("is off with NODE_ENV=%s", (nodeEnv) => {
    expect(isClarityEnvironment(nodeEnv, CLARITY_HOSTNAME)).toBe(false);
  });

  it.each([
    "localhost",
    "carreras-viajeras.mentec.dev.evil.com",
    "evil-carreras-viajeras.mentec.dev",
    "www.carreras-viajeras.mentec.dev",
    "carreras-viajeras.mentec.de",
    "mentec.dev",
    "CARRERAS-VIAJERAS.MENTEC.DEV.example",
  ])("is off on the lookalike hostname %s", (hostname) => {
    expect(isClarityEnvironment("production", hostname)).toBe(false);
  });
});

describe("isClarityPathAllowed", () => {
  it.each([
    "/",
    "/noticias",
    "/noticias/nueva-ruta-2027",
    "/viajes/maraton-santiago-2027",
    "/contacto",
    "/contacto?destino=santiago&c=abc",
    "/noticias#comentarios",
  ])("allows %s", (pathname) => {
    expect(isClarityPathAllowed(pathname)).toBe(true);
  });

  it.each([
    "/crm",
    "/crm/acceso",
    "/crm/leads/123",
    "/crmx",
    "/crm-public",
    "/api",
    "/api/viajes",
    "/api/health",
    "/apix",
    "/cuenta",
    "/cuenta/perfil",
    "/cuentas",
    "/mis-carreras",
    "/mis-carreras/abc",
    "/r",
    "/r/ABC123",
    "/viajes",
    "/viajes/ficha_viaje",
    "/viajes/ficha%5Fviaje",
    "/viajes/ficha_viaje/registro",
    "/viajes/maraton-santiago-2027/registro",
    "/viajes/maraton-santiago-2027/checkout",
    "/viajes/maraton-santiago-2027/checkout?session_id=cs_test_1",
    "/viajes/maraton-santiago-2027/anything",
    "/noticias/slug/extra",
    "/contacto/enviado",
    "/contactos",
    "/noticias/",
    "//crm",
    "/viajes//registro",
    "/viajes/%E0%A4%A",
    "",
    "crm",
    "/otra-pagina",
  ])("denies %s", (pathname) => {
    expect(isClarityPathAllowed(pathname)).toBe(false);
  });

  it("decides on the path only, never the query", () => {
    expect(isClarityPathAllowed("/crm?next=/")).toBe(false);
    expect(isClarityPathAllowed("/?next=/crm")).toBe(true);
  });
});

describe("readAnalyticsConsent", () => {
  it.each(["granted", "denied"] as const)("reads a valid %s decision", (analytics) => {
    const raw = stored({ version: 1, analytics, updatedAt: new Date(NOW - DAY).toISOString() });
    expect(readAnalyticsConsent(raw, NOW)).toBe(analytics);
  });

  it("keeps a decision up to 180 days and drops it afterwards", () => {
    const at = (age: number) =>
      stored({ version: 1, analytics: "granted", updatedAt: new Date(NOW - age).toISOString() });
    expect(readAnalyticsConsent(at(180 * DAY), NOW)).toBe("granted");
    expect(readAnalyticsConsent(at(180 * DAY + 1), NOW)).toBeNull();
  });

  it.each([
    ["no value", null],
    ["corrupt JSON", "{not json"],
    ["a JSON string", stored("granted")],
    ["null JSON", "null"],
    ["an array", stored(["granted"])],
    ["another version", stored({ version: 2, analytics: "granted", updatedAt: new Date(NOW).toISOString() })],
    ["an unknown value", stored({ version: 1, analytics: "yes", updatedAt: new Date(NOW).toISOString() })],
    ["no date", stored({ version: 1, analytics: "granted" })],
    ["a non ISO date", stored({ version: 1, analytics: "granted", updatedAt: "31/10/2026" })],
    ["a future date", stored({ version: 1, analytics: "granted", updatedAt: new Date(NOW + DAY).toISOString() })],
  ])("is pending (null) with %s", (_, raw) => {
    expect(readAnalyticsConsent(raw, NOW)).toBeNull();
  });
});

describe("writeAnalyticsConsent and getStoredAnalyticsConsent", () => {
  it("stores only the versioned decision and its date", () => {
    expect(writeAnalyticsConsent("granted", NOW)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? "")).toEqual({
      version: 1,
      analytics: "granted",
      updatedAt: "2026-10-31T12:00:00.000Z",
    });
    expect(getStoredAnalyticsConsent(NOW + DAY)).toBe("granted");
    expect(window.localStorage.length).toBe(1);
  });

  it("reading does not renew the date", () => {
    writeAnalyticsConsent("denied", NOW);
    getStoredAnalyticsConsent(NOW + 179 * DAY);
    expect(getStoredAnalyticsConsent(NOW + 181 * DAY)).toBeNull();
  });

  it("fails closed when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(writeAnalyticsConsent("granted", NOW)).toBe(false);
    expect(getStoredAnalyticsConsent(NOW)).toBeNull();
  });
});

describe("clearClarityCookies", () => {
  it("expires _clck and _clsk on the host, the hostname and its parent domain, path /", () => {
    const writes: string[] = [];
    const target = {
      set cookie(value: string) {
        writes.push(value);
      },
    };
    clearClarityCookies("carreras-viajeras.mentec.dev", target);

    for (const name of ["_clck", "_clsk"]) {
      const mine = writes.filter((write) => write.startsWith(`${name}=;`));
      expect(mine).toHaveLength(3);
      for (const write of mine) {
        expect(write).toContain("path=/");
        expect(write).toContain("max-age=0");
        expect(write).toContain("expires=Thu, 01 Jan 1970 00:00:00 GMT");
      }
      expect(mine.some((write) => !write.includes("domain="))).toBe(true);
      expect(mine.some((write) => write.endsWith("domain=carreras-viajeras.mentec.dev"))).toBe(true);
      expect(mine.some((write) => write.endsWith("domain=mentec.dev"))).toBe(true);
    }
    expect(writes).toHaveLength(6);
  });

  it("does not try a parent domain for a single-label host", () => {
    const writes: string[] = [];
    clearClarityCookies("localhost", {
      set cookie(value: string) {
        writes.push(value);
      },
    });
    expect(writes.filter((write) => write.includes("domain="))).toEqual([
      expect.stringContaining("domain=localhost"),
      expect.stringContaining("domain=localhost"),
    ]);
  });

  it("removes only Clarity's cookies from the document", () => {
    document.cookie = "_clck=abc; path=/";
    document.cookie = "_clsk=def; path=/";
    document.cookie = "__session=clerk; path=/";
    document.cookie = "__client_uat=1; path=/";
    document.cookie = "other=1; path=/";

    clearClarityCookies(window.location.hostname);

    const names = document.cookie.split("; ").map((pair) => pair.split("=")[0]);
    expect(names).not.toContain("_clck");
    expect(names).not.toContain("_clsk");
    expect(names).toEqual(expect.arrayContaining(["__session", "__client_uat", "other"]));
    for (const name of ["__session", "__client_uat", "other"]) document.cookie = `${name}=; max-age=0; path=/`;
  });
});

describe("ensureClarityQueue", () => {
  it("queues typed commands until the tag replaces it, and reuses an existing one", () => {
    const queue = ensureClarityQueue();
    queue("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
    queue("identify", "user_1");
    expect(window.clarity).toBe(queue);
    expect(queue.q).toEqual([
      ["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }],
      ["identify", "user_1"],
    ]);

    const sdk = Object.assign(vi.fn(), { q: undefined });
    window.clarity = sdk;
    expect(ensureClarityQueue()).toBe(sdk);
  });
});
