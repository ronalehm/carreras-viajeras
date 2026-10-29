import { afterEach, describe, expect, it, vi } from "vitest";
import { isRegistrationOpen, REGISTRATION_CONSENT } from "./registrationConsent";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("REGISTRATION_CONSENT", () => {
  it("has a short lowercase version, stored as leads.consent_version", () => {
    expect(REGISTRATION_CONSENT.version).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("is the clearly identified P-L placeholder until the legal area approves the text", () => {
    expect(REGISTRATION_CONSENT.isPlaceholder).toBe(true);
    expect(REGISTRATION_CONSENT.version).toBe("registro-web-pendiente-pl");
    expect(REGISTRATION_CONSENT.privacyText).toMatch(
      /^\[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL \(P-L\)\]/,
    );
    expect(REGISTRATION_CONSENT.marketingText).toMatch(/^\[TEXTO PROVISIONAL – P-L\]/);
  });
});

describe("isRegistrationOpen", () => {
  it("is closed in production while the text is a placeholder", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isRegistrationOpen()).toBe(false);
  });

  it.each(["development", "test"])("is open in %s with the placeholder", (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    expect(isRegistrationOpen()).toBe(true);
  });

  it("reads NODE_ENV on each call", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isRegistrationOpen()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isRegistrationOpen()).toBe(false);
  });
});
