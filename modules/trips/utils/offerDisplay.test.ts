// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tripOfferStatusEnum } from "@/lib/db-schema";
import { OFFER_STATUS_LABELS, offerScopeLabel, offerTiming, offerValidityText } from "./offerDisplay";

describe("OFFER_STATUS_LABELS", () => {
  it("labels every status in Spanish, in enum order", () => {
    expect(OFFER_STATUS_LABELS).toEqual({
      draft: "Borrador",
      approved: "Aprobada",
      active: "Activa",
      closed: "Cerrada",
    });
    expect(Object.keys(OFFER_STATUS_LABELS)).toEqual([...tripOfferStatusEnum.enumValues]);
  });
});

describe("offerTiming", () => {
  it("is scheduled before valid_from", () => {
    expect(offerTiming("2026-11-01", "2026-11-30", "2026-10-31")).toBe("scheduled");
    expect(offerTiming("2026-11-01", null, "2026-10-31")).toBe("scheduled");
  });

  it("is in force on valid_from (inclusive)", () => {
    expect(offerTiming("2026-11-01", "2026-11-30", "2026-11-01")).toBe("in_force");
  });

  it("is in force on valid_until (inclusive)", () => {
    expect(offerTiming("2026-11-01", "2026-11-30", "2026-11-30")).toBe("in_force");
  });

  it("is expired the day after valid_until", () => {
    expect(offerTiming("2026-11-01", "2026-11-30", "2026-12-01")).toBe("expired");
    expect(offerTiming("2025-12-01", "2025-12-31", "2026-01-01")).toBe("expired");
  });

  it("never expires without valid_until", () => {
    expect(offerTiming("2026-11-01", null, "2026-11-01")).toBe("in_force");
    expect(offerTiming("2026-11-01", null, "2030-01-01")).toBe("in_force");
  });

  it("is in force on a single-day validity", () => {
    expect(offerTiming("2026-11-01", "2026-11-01", "2026-11-01")).toBe("in_force");
  });
});

describe("offerValidityText", () => {
  beforeEach(() => {
    // A process time zone behind UTC would shift a naive local date to the previous day.
    vi.stubEnv("TZ", "America/Lima");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the inclusive range in Lima time when there is an end date", () => {
    expect(offerValidityText("2026-11-01", "2026-11-30")).toBe(
      "Precio válido: 1–30 de noviembre de 2026 (hora de Lima).",
    );
  });

  it("shows both years when the range spans them (Intl puts thin spaces around the dash)", () => {
    expect(offerValidityText("2026-11-15", "2027-01-15")).toBe(
      "Precio válido: 15 de noviembre de 2026 – 15 de enero de 2027 (hora de Lima).",
    );
  });

  it("shows only the start date without an end date", () => {
    expect(offerValidityText("2026-11-01", null)).toBe("Precio vigente desde el 1 de noviembre de 2026.");
  });
});

describe("offerScopeLabel", () => {
  it("labels a general offer", () => {
    expect(offerScopeLabel(null)).toBe("General");
  });

  it("labels a campaign offer with its name and code", () => {
    expect(offerScopeLabel({ code: "mml26", name: "Maratón de Lima 2026" })).toBe(
      "Campaña Maratón de Lima 2026 (mml26)",
    );
  });
});
