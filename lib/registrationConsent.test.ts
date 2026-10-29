import { afterEach, describe, expect, it, vi } from "vitest";
import { isRegistrationOpen, REGISTRATION_CONSENT } from "./registrationConsent";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("REGISTRATION_CONSENT", () => {
  it("has a short lowercase version, stored as leads.consent_version", () => {
    expect(REGISTRATION_CONSENT.version).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("is the approved text: version registro-web-v1, without the P-L placeholder marker", () => {
    expect(REGISTRATION_CONSENT.isPlaceholder).toBe(false);
    expect(REGISTRATION_CONSENT.version).toBe("registro-web-v1");
    expect(REGISTRATION_CONSENT.privacyText).not.toMatch(/PROVISIONAL|P-L/);
    expect(REGISTRATION_CONSENT.marketingText).not.toMatch(/PROVISIONAL|P-L/);
  });
});

describe("isRegistrationOpen", () => {
  it.each(["production", "development", "test"])("is open in %s with the approved text", (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    expect(isRegistrationOpen()).toBe(true);
  });
});
